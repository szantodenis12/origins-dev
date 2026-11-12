-- Concursul de desene „Crăciunul, desenat de cei mici. Ediția I, 2026”.
-- Mirrors `DrawingEntry` in src/lib/db/index.ts; rules in src/lib/drawing.ts.
--
-- A drawing entry is NOT a member: the parent gets no card, the phone is
-- not unique here (one parent can register several children) and nothing
-- joins to `members`. Campaign data is deleted in one go after 31.01.2027
-- (`Db.deleteDrawingEntries`), so there is no retention cron to write.

create table drawing_entries (
  id uuid primary key default gen_random_uuid(),
  -- 'R-001' / 'E-001' / 'P-001': location letter + 3-digit sequence
  code text not null,
  location text not null
    check (location in ('rogerius','era','palatul-copiilor')),
  child_first_name text not null,
  child_age int not null check (child_age between 3 and 14),
  -- derived from child_age in app code (lib/drawing.ts drawingCategory)
  category text not null check (category in ('3-5','6-9','10-14')),
  parent_name text not null,
  -- canonical national format, e.g. '0740038569' (normalized in app code)
  phone text not null,
  consent_participation boolean not null,
  -- reproduction on Origins cups and materials; false = exhibited only
  consent_reproduction boolean not null default false,
  attribution text not null default 'first-name-age'
    check (attribution in ('first-name-age','none')),
  consent_photo boolean not null default false,
  -- separate marketing opt-in ("Vreau informații despre Origins Circle")
  circle_opt_in boolean not null default false,
  status text not null default 'inregistrat'
    check (status in ('inregistrat','depus','expus','selectat','returnat')),
  registered_via text not null check (registered_via in ('web','counter')),
  registered_by uuid references staff_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drawing_entries_participation check (consent_participation)
);

create unique index drawing_entries_code on drawing_entries (code);
create index drawing_entries_location_status
  on drawing_entries (location, status);

-- One row per location holding the last sequence handed out. The function
-- below upserts it inside the caller's transaction, so two parents
-- submitting at the same second cannot both get R-017: the row lock on the
-- upsert serializes them and the unique index on code is the backstop.
create table drawing_code_sequences (
  location text primary key
    check (location in ('rogerius','era','palatul-copiilor')),
  last_sequence int not null default 0
);

create or replace function next_drawing_code(p_location text)
returns text
language plpgsql
as $$
declare
  v_seq int;
  v_prefix text;
begin
  insert into drawing_code_sequences (location, last_sequence)
    values (p_location, 1)
  on conflict (location) do update
    set last_sequence = drawing_code_sequences.last_sequence + 1
  returning last_sequence into v_seq;

  v_prefix := case p_location
    when 'rogerius' then 'R'
    when 'era' then 'E'
    when 'palatul-copiilor' then 'P'
  end;
  if v_prefix is null then
    raise exception 'unknown drawing location: %', p_location;
  end if;

  return v_prefix || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

-- Fail closed, like every other table: the server-side adapter is the only
-- reader. The public /desen form never touches Supabase from the browser.
alter table drawing_entries enable row level security;
alter table drawing_code_sequences enable row level security;
