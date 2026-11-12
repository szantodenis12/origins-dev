-- Concursul de desene 2026: persistent campaign store (phase "xmas").
-- Run after 0010_drawing_gallery_votes.sql. Mirrors the campaign half of the
-- `Db` interface in src/lib/db/index.ts (`CampaignDb`); the behavioural
-- reference is the memory adapter (src/lib/db/memory.ts) and the server
-- adapter is src/lib/db/supabase.ts (PostgREST + service role, server only).
--
-- What this adds:
--   * drawing_entries: sheet kind, physical submission, winner kind (vote |
--     jury), winner acceptance, jury reserve order. `vote_winner` stays as a
--     GENERATED column (= winner_kind = 'vote'), so 0003's meaning and every
--     reader of vote_winner keep working while winner_kind is the only
--     thing ever written.
--   * registered_by / submitted_by are text: staff still live in the
--     in-memory loyalty adapter ("staff-rogerius"), not in staff_users.
--   * campaign_state (singleton) — `CampaignState` in lib/campaign-phase.ts.
--   * campaign_events — `CampaignEvent` in lib/campaign-metrics.ts. No
--     personal data column, by construction.
--   * campaign_rate_limits — one shared fixed-window counter for every
--     Vercel instance (keys arrive hashed, never a raw IP or e-mail).
--   * RPCs for everything that must be atomic: entry + sequential code,
--     vote cast, winner swap, data deletion, rate-limit hit.
--   * Privileges: anon/authenticated lose every grant on the campaign
--     tables and functions. RLS is on with no policy, so even a future
--     accidental grant reads nothing. Only service_role (BYPASSRLS) gets in.

/* ---------------------------------------------------------------- entries --- */

alter table drawing_entries
  drop constraint if exists drawing_entries_registered_by_fkey;
alter table drawing_entries
  alter column registered_by type text using registered_by::text;

alter table drawing_entries
  -- what the child drew on; null until the sheet is physically handed in.
  -- 'alta-foaie' = other paper: exhibited, never selectable for print.
  add column sheet_kind text
    check (sheet_kind in ('oficiala','colorat','alta-foaie')),
  -- physical drawing + signed form received at a café (status 'depus')
  add column submitted_at timestamptz,
  add column submitted_by text,
  -- 'vote' = public-vote winner of its age group, 'jury' = jury pick
  add column winner_kind text check (winner_kind in ('vote','jury')),
  -- the parent accepted after the private phone call
  add column winner_accepted_at timestamptz,
  -- jury reserve order inside the category (1 = first reserve)
  add column reserve_rank int;

-- vote_winner (0003) becomes derived from winner_kind. Carry the data over,
-- drop the dependent objects with the column, recreate them on winner_kind.
update drawing_entries set winner_kind = 'vote' where vote_winner;
alter table drawing_entries drop constraint if exists drawing_entries_vote_winner_printable;
alter table drawing_entries drop constraint if exists drawing_entries_winner_not_jury;
drop index if exists drawing_entries_one_vote_winner;
alter table drawing_entries drop column vote_winner;
alter table drawing_entries
  add column vote_winner boolean
    generated always as (coalesce(winner_kind = 'vote', false)) stored;

alter table drawing_entries
  -- any cup winner must be printable: reproduction consent, official sheet
  add constraint drawing_entries_winner_printable
    check (
      winner_kind is null
      or (consent_reproduction and sheet_kind is distinct from 'alta-foaie')
    ),
  -- vote winners are decided first; the jury picks ("selectat") from the rest
  add constraint drawing_entries_winner_not_jury
    check (not (winner_kind = 'vote' and status = 'selectat')),
  -- 'selectat' is the print ladder: never on a sheet that cannot be printed
  add constraint drawing_entries_selectat_printable
    check (
      status <> 'selectat'
      or (consent_reproduction and sheet_kind is distinct from 'alta-foaie')
    ),
  add constraint drawing_entries_accepted_needs_winner
    check (winner_accepted_at is null or winner_kind is not null),
  -- a reserve is not (yet) a winner, and must be printable to step in
  add constraint drawing_entries_reserve_rank
    check (
      reserve_rank is null
      or (
        reserve_rank >= 1
        and winner_kind is null
        and consent_reproduction
        and sheet_kind is distinct from 'alta-foaie'
      )
    ),
  add constraint drawing_entries_submitted
    check (submitted_at is null or sheet_kind is not null);

-- One public-vote winner per age group (same rule as 0003, new column).
create unique index drawing_entries_one_vote_winner
  on drawing_entries (category) where winner_kind = 'vote';
-- One reserve per rank per age group.
create unique index drawing_entries_reserve_rank_unique
  on drawing_entries (category, reserve_rank) where reserve_rank is not null;
create index drawing_entries_created on drawing_entries (created_at desc);

/* --------------------------------------------------------- campaign state --- */

create table campaign_state (
  id boolean primary key default true check (id),
  results_published_at timestamptz,
  collection_confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into campaign_state (id) values (true) on conflict do nothing;

/* -------------------------------------------------------- campaign events --- */

-- Event name + whitelisted, non-identifying properties. Never a name, a
-- phone, an e-mail, a drawing id or anything that joins back to a person.
create table campaign_events (
  id bigint generated always as identity primary key,
  name text not null check (name in (
    'prereg_complete','physical_submission','publication',
    'vote_code_request','vote_confirmed',
    'instructions_view','prereg_start','share','map_click'
  )),
  location text check (location ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  channel text check (channel ~ '^[a-z0-9][a-z0-9-]{0,39}$' and channel !~ '[0-9]{6,}'),
  category text check (category ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  method text check (method ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  created_at timestamptz not null default now()
);
create index campaign_events_name_time on campaign_events (name, created_at);
create index campaign_events_time on campaign_events (created_at);

/* ---------------------------------------------------- shared rate limiter --- */

create table campaign_rate_limits (
  -- sha256 hex of the caller's key ("vote-send-ip:1.2.3.4"), never raw
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits int not null
);
create index campaign_rate_limits_window on campaign_rate_limits (window_start);

-- True when the call is allowed (and counted). Fixed window, like
-- lib/rate-limit.ts, but one counter for every instance.
create or replace function campaign_rate_limit_hit(
  p_key_hash text,
  p_limit int,
  p_window_ms bigint,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
as $$
declare
  v_hits int;
begin
  insert into campaign_rate_limits as r (key_hash, window_start, hits)
    values (p_key_hash, p_now, 1)
  on conflict (key_hash) do update
    set window_start = case
          when r.window_start <= p_now - make_interval(secs => p_window_ms / 1000.0)
            then p_now else r.window_start end,
        hits = case
          when r.window_start <= p_now - make_interval(secs => p_window_ms / 1000.0)
            then 1 else r.hits + 1 end
  returning hits into v_hits;
  -- Opportunistic sweep, cheap with the index.
  if random() < 0.01 then
    delete from campaign_rate_limits
      where window_start < p_now - interval '1 day';
  end if;
  return v_hits <= p_limit;
end;
$$;

/* ------------------------------------------------------------------- RPCs --- */

-- Entry + its sequential code in ONE transaction: the sequence row lock in
-- next_drawing_code (0002) serializes concurrent submits, the unique index
-- on code is the backstop, and a failed insert rolls the sequence back, so
-- codes have no gaps. Validation (names, phone, age, consents) happens in
-- the adapter first (src/lib/db/campaign-rules.ts), the table checks again.
create or replace function create_drawing_entry(p jsonb)
returns drawing_entries
language plpgsql
as $$
declare
  v_row drawing_entries;
  v_at timestamptz := coalesce((p->>'created_at')::timestamptz, now());
begin
  insert into drawing_entries (
    code, location, child_first_name, child_age, category, parent_name,
    phone, consent_participation, consent_reproduction, attribution,
    consent_photo, consent_gallery, circle_opt_in, status, registered_via,
    registered_by, created_at, updated_at
  ) values (
    next_drawing_code(p->>'location'),
    p->>'location',
    p->>'child_first_name',
    (p->>'child_age')::int,
    p->>'category',
    p->>'parent_name',
    p->>'phone',
    (p->>'consent_participation')::boolean,
    (p->>'consent_reproduction')::boolean,
    p->>'attribution',
    (p->>'consent_photo')::boolean,
    coalesce((p->>'consent_gallery')::boolean, false),
    (p->>'circle_opt_in')::boolean,
    'inregistrat',
    p->>'registered_via',
    nullif(p->>'registered_by', ''),
    v_at,
    v_at
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- A vote from an already verified e-mail hash: live check + insert in one
-- statement scope. Same words as `CastVoteResult`.
create or replace function cast_drawing_vote(
  p_entry_id uuid,
  p_email_hash text,
  p_at timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_live boolean;
  v_inserted int;
begin
  select (published_at is not null and unpublished_at is null) into v_live
    from drawing_entries where id = p_entry_id
    for share;
  if not coalesce(v_live, false) then
    return 'not_live';
  end if;
  insert into drawing_votes (entry_id, email_hash, created_at)
    values (p_entry_id, p_email_hash, p_at)
  on conflict (entry_id, email_hash) do nothing;
  get diagnostics v_inserted = row_count;
  return case when v_inserted = 1 then 'voted' else 'already_voted' end;
end;
$$;

-- Marks or clears a cup winner, atomically. p_kind: 'vote' | 'jury' | null.
-- Returns {"status": ..., "replaced_id": uuid|null}; statuses mirror
-- `SetDrawingWinnerResult` in src/lib/db/index.ts:
--   saved | not_found | not_live | not_eligible | is_jury_pick | is_vote_winner
create or replace function set_drawing_winner(
  p_entry_id uuid,
  p_kind text,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
as $$
declare
  v_entry drawing_entries;
  v_replaced uuid;
begin
  select * into v_entry from drawing_entries where id = p_entry_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if p_kind is null then
    update drawing_entries
      set winner_kind = null, winner_accepted_at = null, updated_at = p_at
      where id = p_entry_id;
    return jsonb_build_object('status', 'saved', 'replaced_id', null);
  end if;

  if p_kind not in ('vote', 'jury') then
    raise exception 'unknown winner kind: %', p_kind;
  end if;
  if v_entry.winner_kind is not distinct from p_kind then
    return jsonb_build_object('status', 'saved', 'replaced_id', null);
  end if;
  if p_kind = 'vote'
     and not (v_entry.published_at is not null and v_entry.unpublished_at is null) then
    return jsonb_build_object('status', 'not_live');
  end if;
  if not v_entry.consent_reproduction
     or v_entry.sheet_kind is not distinct from 'alta-foaie' then
    return jsonb_build_object('status', 'not_eligible');
  end if;
  if p_kind = 'vote' and v_entry.status = 'selectat' then
    return jsonb_build_object('status', 'is_jury_pick');
  end if;
  if p_kind = 'jury' and v_entry.winner_kind = 'vote' then
    return jsonb_build_object('status', 'is_vote_winner');
  end if;

  if p_kind = 'vote' then
    -- one per age group: the previous one steps down in the same transaction
    update drawing_entries
      set winner_kind = null, winner_accepted_at = null, updated_at = p_at
      where category = v_entry.category
        and winner_kind = 'vote'
        and id <> p_entry_id
      returning id into v_replaced;
  end if;

  update drawing_entries
    set winner_kind = p_kind,
        winner_accepted_at = null,
        reserve_rank = null,
        updated_at = p_at
    where id = p_entry_id;
  return jsonb_build_object('status', 'saved', 'replaced_id', v_replaced);
end;
$$;

-- End of campaign (after 31.01.2027): every entry goes, votes and codes
-- with it (on delete cascade), sequences restart at 001. campaign_events
-- stay: they hold no personal data. Returns the number of entries deleted.
create or replace function delete_drawing_campaign_data()
returns int
language plpgsql
as $$
declare
  v_deleted int;
begin
  delete from drawing_entries where true;
  get diagnostics v_deleted = row_count;
  delete from drawing_code_sequences where true;
  delete from campaign_rate_limits where true;
  return v_deleted;
end;
$$;

/* ------------------------------------------------------- privileges + RLS --- */

alter table campaign_state enable row level security;
alter table campaign_events enable row level security;
alter table campaign_rate_limits enable row level security;

-- Supabase grants anon/authenticated everything on public by default; RLS
-- with no policy already returns nothing, this makes it a hard "permission
-- denied" for the campaign tables, parent data first.
do $$
declare
  t text;
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach t in array array[
        'drawing_entries', 'drawing_code_sequences', 'drawing_votes',
        'drawing_vote_codes', 'campaign_state', 'campaign_events',
        'campaign_rate_limits'
      ] loop
        execute format('revoke all on table %I from %I', t, r);
      end loop;
    end if;
  end loop;
end;
$$;

-- Functions are executable by PUBLIC by default; only the server may call
-- these (they run as the caller, so RLS would stop anon anyway).
revoke execute on function next_drawing_code(text) from public;
revoke execute on function redeem_drawing_vote_code(uuid, text, text, int) from public;
revoke execute on function create_drawing_entry(jsonb) from public;
revoke execute on function cast_drawing_vote(uuid, text, timestamptz) from public;
revoke execute on function set_drawing_winner(uuid, text, timestamptz) from public;
revoke execute on function delete_drawing_campaign_data() from public;
revoke execute on function campaign_rate_limit_hit(text, int, bigint, timestamptz) from public;

do $$
declare
  f text;
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach f in array array[
        'next_drawing_code(text)',
        'redeem_drawing_vote_code(uuid, text, text, int)',
        'create_drawing_entry(jsonb)',
        'cast_drawing_vote(uuid, text, timestamptz)',
        'set_drawing_winner(uuid, text, timestamptz)',
        'delete_drawing_campaign_data()',
        'campaign_rate_limit_hit(text, int, bigint, timestamptz)'
      ] loop
        execute format('revoke execute on function %s from %I', f, r);
      end loop;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on
      drawing_entries, drawing_code_sequences, drawing_votes,
      drawing_vote_codes, campaign_state, campaign_events,
      campaign_rate_limits
      to service_role;
    grant execute on function
      next_drawing_code(text),
      redeem_drawing_vote_code(uuid, text, text, int),
      create_drawing_entry(jsonb),
      cast_drawing_vote(uuid, text, timestamptz),
      set_drawing_winner(uuid, text, timestamptz),
      delete_drawing_campaign_data(),
      campaign_rate_limit_hit(text, int, bigint, timestamptz)
      to service_role;
  end if;
end;
$$;

-- PostgREST caches the schema; tell it to reload after this migration.
notify pgrst, 'reload schema';
