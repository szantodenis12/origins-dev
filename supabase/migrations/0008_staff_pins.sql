-- Migration 0008: a personal code per (person, cafenea).
--
-- Until now a person had exactly one code, stored on staff_users.pin_hash,
-- and login matched it against staff_users.location_slug. Someone covering a
-- shift at another cafenea could not log in there at all: they used the
-- cafenea's shared code, which has no identity, so their stamps were saved
-- with staff_id = null and their work showed up under nobody in Statistici.
--
-- Codes move to their own table, keyed by person AND cafenea. One row = "this
-- person can start a shift at this cafenea, with this code". Revoking access
-- at one cafenea is deleting one row; the others keep working.
--
-- staff_users.pin_hash stays for now, unread by the application after this
-- deploy. It is dropped in a later migration, once production has run on the
-- new path — a backfill that silently missed somebody must stay recoverable.

CREATE TABLE IF NOT EXISTS staff_pins (
  staff_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  location_slug text NOT NULL REFERENCES locations(slug),
  -- Peppered HMAC, never a readable code (lib/admin/staff-pin.ts). The pepper
  -- is the secret: a dump of this table verifies nothing without it.
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One code per person per cafenea. Two codes at the same cafenea would make
  -- "which one is live" a coin toss.
  PRIMARY KEY (staff_id, location_slug)
);

-- Login reads every code at the selected cafenea and compares hashes, so this
-- is the hot path: one small index per cafenea instead of a table scan.
CREATE INDEX IF NOT EXISTS staff_pins_location_idx
  ON staff_pins (location_slug);

-- Backfill: everyone keeps the code they have today, at the cafenea they have
-- it for. Nobody is locked out by the deploy. Shared accounts are skipped —
-- their code lives in the environment (ADMIN_DEV_PIN / ADMIN_MANAGER_PIN),
-- not in the store.
INSERT INTO staff_pins (staff_id, location_slug, pin_hash)
SELECT id, location_slug, pin_hash
  FROM staff_users
 WHERE pin_hash IS NOT NULL
   AND location_slug IS NOT NULL
   AND shared = false
ON CONFLICT (staff_id, location_slug) DO NOTHING;

-- Same posture as 0007: deny by default. The server holds the service role
-- key and bypasses RLS; everything else is refused loudly instead of reading
-- an empty table and concluding that nobody has a code.
ALTER TABLE staff_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON staff_pins FROM anon, authenticated;

COMMENT ON TABLE staff_pins IS
  'Personal shift codes, one per (person, cafenea). Server-only, written via '
  'the service role. RLS on with no policies is deliberate. Holds peppered '
  'hashes: a code is shown to the manager once, at creation, and never again.';

COMMENT ON COLUMN staff_users.pin_hash IS
  'DEPRECATED since migration 0008 — codes live in staff_pins. Kept only so '
  'the backfill stays reversible; drop once the new path is proven.';
