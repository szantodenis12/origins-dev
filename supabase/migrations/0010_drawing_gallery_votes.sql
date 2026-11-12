-- Concursul de desene 2026: galeria online și votul public.
-- Mirrors the gallery fields of `DrawingEntry`, `DrawingVote` and the vote
-- code methods in src/lib/db/index.ts. Rules: src/lib/drawing.ts (publish
-- preconditions, public payload) and src/lib/drawing-vote.ts (ranking,
-- close time). Run after 0009_drawing_entries.sql.
--
-- What is deliberately NOT here:
--   * no e-mail column anywhere. A voter exists only as `email_hash`, an
--     HMAC-SHA256 of the normalized address keyed with VOTE_HASH_SECRET
--     (src/lib/vote-hash.ts). The address is used once, to send the code.
--   * no vote counter on drawing_entries. Counts are computed for the
--     manager screen only and must never reach a public query.

/* ---------------------------------------------------------------- entries --- */

alter table drawing_entries
  -- separate GDPR consent for publishing online; never assumed
  add column consent_gallery boolean not null default false,
  -- PRIVATE storage key of the untouched camera file (cup supplier, 04.12)
  add column image_original text,
  -- public URL/path of the <= 1600 px JPEG shown in the gallery
  add column image_web text,
  add column image_width int,
  add column image_height int,
  -- public URL/path of the cup mockup image (also the Open Graph image);
  -- only generated for drawings with consent_reproduction
  add column cup_mockup text,
  -- first time online; votes per day are counted from here, never reset
  add column published_at timestamptz,
  -- set on take-down (moderation), null while live
  add column unpublished_at timestamptz,
  -- public-vote winner of its age group, set by the manager
  add column vote_winner boolean not null default false;

-- Publishing needs the consent and a photo. The status rule (depus/expus at
-- the moment of publishing) stays in the adapter: the status moves on
-- afterwards (selectat, returnat) while the drawing remains in the gallery.
alter table drawing_entries
  add constraint drawing_entries_publish_needs_consent
    check (published_at is null or (consent_gallery and image_web is not null)),
  -- a cup winner must be printable
  add constraint drawing_entries_vote_winner_printable
    check (not vote_winner or consent_reproduction),
  -- vote winners are decided first; the jury picks from the rest
  add constraint drawing_entries_winner_not_jury
    check (not (vote_winner and status = 'selectat'));

-- One public-vote winner per age group.
create unique index drawing_entries_one_vote_winner
  on drawing_entries (category) where vote_winner;

-- The gallery query: live drawings.
create index drawing_entries_live
  on drawing_entries (category, published_at)
  where published_at is not null and unpublished_at is null;

/* ------------------------------------------------------------------ votes --- */

create table drawing_votes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references drawing_entries(id) on delete cascade,
  -- hex HMAC-SHA256 of the normalized e-mail; never the address
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

-- THE rule: one vote per drawing per verified e-mail. A person may vote for
-- several different drawings.
create unique index drawing_votes_one_per_email
  on drawing_votes (entry_id, email_hash);
-- "first-time e-mail" lookups for the burst flag on the manager screen
create index drawing_votes_email_time on drawing_votes (email_hash, created_at);

-- Pending e-mail codes: one per (drawing, e-mail hash), replaced on resend.
create table drawing_vote_codes (
  entry_id uuid not null references drawing_entries(id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  -- HMAC of the 6 digits, bound to the drawing and the voter
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  primary key (entry_id, email_hash)
);

-- Checks a code and records the vote in ONE transaction, so two requests
-- with the same code cannot both count an attempt or both insert a vote.
-- Returns the same words as `RedeemVoteCodeResult` / `CastVoteResult`:
--   voted | already_voted | wrong_code | expired | too_many_attempts | no_code
-- For wrong_code the adapter reads `attempts` back to report how many are left.
create or replace function redeem_drawing_vote_code(
  p_entry_id uuid,
  p_email_hash text,
  p_code_hash text,
  p_max_attempts int
)
returns text
language plpgsql
as $$
declare
  v_code drawing_vote_codes%rowtype;
  v_live boolean;
  v_inserted int;
begin
  select * into v_code
    from drawing_vote_codes
    where entry_id = p_entry_id and email_hash = p_email_hash
    for update;
  if not found then
    return 'no_code';
  end if;
  if v_code.expires_at <= now() then
    return 'expired';
  end if;
  if v_code.attempts >= p_max_attempts then
    return 'too_many_attempts';
  end if;
  if v_code.code_hash <> p_code_hash then
    update drawing_vote_codes
      set attempts = attempts + 1
      where entry_id = p_entry_id and email_hash = p_email_hash;
    if v_code.attempts + 1 >= p_max_attempts then
      return 'too_many_attempts';
    end if;
    return 'wrong_code';
  end if;

  -- Right code: spent whatever happens next.
  delete from drawing_vote_codes
    where entry_id = p_entry_id and email_hash = p_email_hash;

  select (published_at is not null and unpublished_at is null) into v_live
    from drawing_entries where id = p_entry_id;
  if not coalesce(v_live, false) then
    return 'no_code';
  end if;

  insert into drawing_votes (entry_id, email_hash)
    values (p_entry_id, p_email_hash)
  on conflict (entry_id, email_hash) do nothing;
  get diagnostics v_inserted = row_count;
  return case when v_inserted = 1 then 'voted' else 'already_voted' end;
end;
$$;

-- Expired codes are useless; sweep them whenever convenient (cron or on send).
create index drawing_vote_codes_expiry on drawing_vote_codes (expires_at);

-- Fail closed, like every other table: only the server-side adapter reads
-- these. In particular NO anon policy on drawing_votes, ever: a public
-- `select count(*)` would be exactly the counter the client ruled out.
alter table drawing_votes enable row level security;
alter table drawing_vote_codes enable row level security;
