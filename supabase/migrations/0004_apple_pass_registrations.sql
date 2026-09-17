-- Migration 0004: Apple PassKit device registrations table
-- Used by Apple Wallet to store device push tokens for auto-updating passes when stamps/rewards change.

CREATE TABLE IF NOT EXISTS apple_pass_registrations (
  device_id TEXT NOT NULL,
  pass_type_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  push_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (device_id, pass_type_id, serial_number)
);

-- Enable RLS for security
ALTER TABLE apple_pass_registrations ENABLE ROW LEVEL SECURITY;
