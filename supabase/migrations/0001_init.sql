-- Origins platform — initial schema (mirrors src/lib/types.ts)
-- Spec: CLIENTI/OriginsCafe/PLATFORMA/SPEC_ARHITECTURA_PLATFORMA.md

create table locations (
  slug text primary key,
  name text not null,
  address_ro text,
  address_hu text,
  address_en text,
  hours_ro text,
  hours_hu text,
  hours_en text,
  coming_soon boolean not null default false,
  seasonal_note_ro text,
  seasonal_note_hu text,
  seasonal_note_en text,
  photo_url text,          -- card photo: home list + atmosphere band
  hero_photo_url text,     -- full-bleed photo behind the name on the location page
  google_place_id text,
  google_rating numeric(2,1) check (google_rating between 1 and 5),
  google_review_count int check (google_review_count >= 0),
  rating_synced_at timestamptz,
  review_url text,
  wolt_url text,
  serves_alcohol boolean -- null = not confirmed
);

create table categories (
  slug text primary key,
  name_ro text not null,
  name_hu text,
  name_en text,
  photo_url text,
  sort_order int not null default 0
);

create table products (
  id text primary key,
  category_slug text not null references categories(slug),
  name_ro text not null,
  name_hu text,
  name_en text,
  description_ro text,
  description_hu text,
  description_en text,
  price numeric(6,2) check (price > 0),
  price_from numeric(6,2) check (price_from > 0),
  photo_url text,
  alcohol boolean not null default false,
  seasonal boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  constraint products_one_price check (price is null or price_from is null)
);

-- null rows in product_availability = product available everywhere
create table product_availability (
  product_id text not null references products(id) on delete cascade,
  location_slug text not null references locations(slug) on delete cascade,
  primary key (product_id, location_slug)
);

create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- canonical national format, e.g. '0740038569' (normalized in app code)
  phone text not null unique,
  -- full birthdate: age check for the under-16 parental-consent rule
  birth_day int check (birth_day between 1 and 31),
  birth_month int check (birth_month between 1 and 12),
  birth_year int check (birth_year between 1900 and 2100),
  lang text not null default 'ro' check (lang in ('ro','hu','en')),
  is_student boolean not null default false,
  student_verified_at timestamptz,
  student_verified_by uuid,
  pass_platform text check (pass_platform in ('apple','google','web')),
  pass_serial text unique,
  -- mandatory program/privacy acceptance recorded at signup
  consent_at timestamptz,
  consent_version text,
  -- separate, optional consent; accepting the program terms is not marketing consent
  marketing_consent_at timestamptz,
  marketing_consent_version text,
  review_intent_at timestamptz,
  review_bonus_given boolean not null default false,
  -- manager freeze: a blocked card earns nothing (addStamp/redeemReward refuse)
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint birthday_complete check (
    (birth_day is null) = (birth_month is null)
    and (birth_month is null) = (birth_year is null)
  )
);

-- Staff are never hard-deleted: stamp_events and redemptions reference them
-- and the Statistici screen is built on that history. Deactivating (active =
-- false) blocks login and hides the row from the active team list while every
-- past stamp stays attributed.
create table staff_users (
  id uuid primary key, -- mirrors auth.users.id
  name text not null,
  role text not null check (role in ('barista','manager')),
  location_slug text references locations(slug),
  active boolean not null default true,
  -- The cafenea's shared account, the one a common code logs into. A shift
  -- started without a personal identity resolves ONLY to this row: falling
  -- through to any barista at the same cafenea would credit them with stamps
  -- somebody else scanned, and the per-barista stats exist precisely to show
  -- who is scanning. At most one per (location, role).
  shared boolean not null default false
);

create unique index staff_users_one_shared_per_role
  on staff_users (location_slug, role)
  where shared;

alter table members
  add constraint members_student_verified_by_fkey
  foreign key (student_verified_by) references staff_users(id);

-- `member_id` detaches instead of cascading: erasing a member (GDPR art. 17,
-- `Db.forgetMember`) must remove the person, not the café's operational
-- record. Those coffees really were handed over, and the per-location,
-- per-barista and reward totals in Statistici must not shrink retroactively
-- because somebody exercised their right. Null member_id = an anonymised
-- event. The memory adapter models the same thing with a sentinel id.
create table stamp_events (
  id bigint generated always as identity primary key,
  member_id uuid references members(id) on delete set null,
  location_slug text not null references locations(slug),
  staff_id uuid references staff_users(id),
  kind text not null default 'normal'
    check (kind in ('normal','double_tuesday','review_bonus','signup_promo')),
  created_at timestamptz not null default now()
);

-- Reward ids are STRUCTURAL, never numeric: how many stamps the free drink
-- takes is a setting (loyalty_config), so an id like 'coffee_8' would go
-- stale the first time the manager changes the card.
--   free_coffee — ends the card and starts a new one
--   upgrade     — optional mid-card reward, does not reset the card
--   gold_addon / gold_coffee — the rotating Gold perks, earned per period
--   birthday_drink — once around the member's birthday, earned by the calendar
create table rewards (
  id text primary key
    check (id in ('free_coffee','upgrade','gold_addon','gold_coffee','birthday_drink')),
  name_ro text not null,
  name_hu text,
  name_en text,
  stamps_required int,
  active boolean not null default true
);

-- The loyalty program itself, as edited in /admin/setari. One row, ever:
-- `id` is pinned to true so a second one cannot be inserted. Shape and
-- defaults live in src/lib/program.ts (`LoyaltyConfig`), which also
-- sanitizes anything read back out — the app never trusts this blob blindly.
create table loyalty_config (
  id boolean primary key default true check (id),
  config jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references staff_users(id)
);

-- Detaches rather than cascades, for the same reason as stamp_events above.
create table redemptions (
  id bigint generated always as identity primary key,
  member_id uuid references members(id) on delete set null,
  reward_id text not null references rewards(id),
  location_slug text not null references locations(slug),
  staff_id uuid references staff_users(id),
  -- Gold perks only: the perk period consumed, frozen at redeem time so a
  -- later change to periodDays/anchorDate cannot re-open a claimed fortnight
  -- (lib/gold.ts perkUsedAt checks overlap against these bounds).
  perk_period_start timestamptz,
  perk_period_end timestamptz,
  created_at timestamptz not null default now(),
  constraint redemptions_perk_period_complete check (
    (perk_period_start is null) = (perk_period_end is null)
  )
);

create table push_campaigns (
  id bigint generated always as identity primary key,
  message_ro text not null,
  message_hu text,
  -- 'gold' targets members whose DERIVED Gold status is active at send time
  -- (computed from stamp_events + redemptions via lib/gold.ts — never stored).
  segment text not null default 'all'
    check (segment in ('all','students','families','gold','ro','hu')),
  sent_at timestamptz,
  passes_updated int,
  created_by uuid references staff_users(id),
  created_at timestamptz not null default now()
);

-- Jurnalul de modificări: who did what in the admin. The manager code is
-- shared between people, so this log is the only way to answer "cine a
-- schimbat programul". Append-only; stamps and redemptions are NOT here —
-- they already are the event history. Never write a PIN, a hash or a
-- member's phone number into a row.
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff_id uuid references staff_users(id),
  -- the actor's name, copied at write time: a later rename must not rewrite history
  staff_name text not null,
  location_slug text,
  action text not null,
  target text not null,
  summary text not null,
  details jsonb
);

create index audit_log_at on audit_log (at desc);

-- campaign toggles (e.g. student signup promo window)
create table campaign_flags (
  key text primary key, -- 'student_signup_promo'
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz
);

-- anti-abuse: one stamp per member per location per 2h enforced in API layer;
-- index to make the check cheap
create index stamp_events_member_recent
  on stamp_events (member_id, location_slug, created_at desc);

-- Defense in depth: the review bonus is once per member, including under
-- concurrent requests. The transactional stamp RPC still performs the
-- friendly pre-check and maps this constraint to `bonus_used`.
create unique index stamp_events_one_review_bonus
  on stamp_events (member_id)
  where kind = 'review_bonus';

-- Fail closed until the Supabase adapter adds role-specific policies. Public
-- pages query through the server-side adapter; no table is exposed directly
-- through the anonymous Supabase API.
alter table locations enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_availability enable row level security;
alter table members enable row level security;
alter table staff_users enable row level security;
alter table stamp_events enable row level security;
alter table rewards enable row level security;
alter table loyalty_config enable row level security;
alter table redemptions enable row level security;
alter table push_campaigns enable row level security;
alter table campaign_flags enable row level security;
alter table audit_log enable row level security;
