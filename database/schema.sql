-- SoundStage / Supabase PostgreSQL. Run as the project database owner.
-- This migration never drops existing tables or imports browser passwords.
BEGIN;
SELECT pg_advisory_xact_lock(74832019);
CREATE SCHEMA IF NOT EXISTS soundstage;
REVOKE ALL ON SCHEMA soundstage FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS soundstage.schema_versions (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS soundstage.identities (
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  role text NOT NULL CHECK (role IN ('client', 'provider', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- JSONB preserves the existing application's nested booking/refund/document records.
CREATE TABLE IF NOT EXISTS soundstage.clerk_identities (
  clerk_id text PRIMARY KEY CHECK (clerk_id LIKE 'user_%'),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  role text NOT NULL CHECK (role IN ('client', 'provider')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE soundstage.clerk_identities ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS soundstage.profiles (
  clerk_user_id text PRIMARY KEY CHECK (clerk_user_id LIKE 'user_%'),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('client', 'provider', 'payroll_master', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE soundstage.profiles ENABLE ROW LEVEL SECURITY;
INSERT INTO soundstage.profiles (clerk_user_id, email, role, created_at)
SELECT clerk_id, email, role, created_at FROM soundstage.clerk_identities
ON CONFLICT DO NOTHING;
-- Signup OTP state is private to the server; never exposed by the Data API.
CREATE TABLE IF NOT EXISTS soundstage.signup_phone_verifications (
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (phone ~ '^\+639[0-9]{9}$'),
  nonce text NOT NULL,
  otp_digest text,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL,
  window_started_at timestamptz NOT NULL,
  send_count integer NOT NULL DEFAULT 1 CHECK (send_count > 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  delivered boolean NOT NULL DEFAULT false,
  verified_at timestamptz
);
CREATE INDEX IF NOT EXISTS signup_phone_rate_limit_idx ON soundstage.signup_phone_verifications(phone, window_started_at);
ALTER TABLE soundstage.signup_phone_verifications ENABLE ROW LEVEL SECURITY;
-- Keys identify collections and their owners; only the authenticated server API may
-- read or modify these records. This schema is intentionally not exposed by PostgREST.
CREATE TABLE IF NOT EXISTS soundstage.records (
  key text PRIMARY KEY CHECK (key LIKE 'soundstage-%'),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE soundstage.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundstage.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundstage.schema_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA soundstage FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundstage REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
INSERT INTO soundstage.schema_versions(version) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO soundstage.schema_versions(version) VALUES (2) ON CONFLICT DO NOTHING;
INSERT INTO soundstage.schema_versions(version) VALUES (3) ON CONFLICT DO NOTHING;
INSERT INTO soundstage.schema_versions(version) VALUES (4) ON CONFLICT DO NOTHING;
COMMIT;
