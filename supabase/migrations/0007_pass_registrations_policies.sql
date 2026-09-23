-- Migration 0007: lock down apple_pass_registrations properly.
--
-- 0004 switched RLS on and created no policies, which means every role except
-- service_role reads an empty table and cannot write. That works today only
-- because the server holds the service role key; anything else (a client,
-- another key, a future RLS-aware path) fails silently, and a silently lost
-- registration is a member whose card never updates again.
--
-- Deny-by-default is the right posture for push tokens, so this makes it
-- explicit rather than accidental, and adds the index the delete-by-token
-- cleanup needs.

-- Explicit: no anon/authenticated access. service_role bypasses RLS entirely,
-- so the server keeps working; anything else is refused loudly rather than
-- returning zero rows as if the table were empty.
REVOKE ALL ON apple_pass_registrations FROM anon, authenticated;

-- Dead-token cleanup deletes by push_token (see lib/wallet/pass-store.ts),
-- and notifyPassUpdated looks registrations up by serial.
CREATE INDEX IF NOT EXISTS apple_pass_registrations_push_token_idx
  ON apple_pass_registrations (push_token);

CREATE INDEX IF NOT EXISTS apple_pass_registrations_serial_idx
  ON apple_pass_registrations (serial_number);

COMMENT ON TABLE apple_pass_registrations IS
  'Device push tokens for Apple Wallet pass updates. Server-only: written by '
  'the PassKit web service via the service role. RLS on with no policies is '
  'deliberate.';
