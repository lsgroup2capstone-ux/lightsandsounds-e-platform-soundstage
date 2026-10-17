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
-- Relational bookings (booking-schedule plan 1). The database itself prevents
-- double-booking, invalid statuses, history edits and snapshot edits.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS soundstage.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE,
  client_email text NOT NULL CHECK (client_email = lower(client_email)),
  provider_email text NOT NULL CHECK (provider_email = lower(provider_email)),
  package_id text,
  package_name text NOT NULL,
  package_inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  package_price numeric(12,2) NOT NULL CHECK (package_price >= 0),
  base_price numeric(12,2),
  transportation_fee numeric(12,2),
  total numeric(12,2),
  start_date date NOT NULL,
  end_date date NOT NULL,
  event_time text,
  event_type text,
  location text,
  event_town text,
  guests integer,
  notes text,
  image text,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'declined', 'cancelled', 'refund_pending', 'refunded')),
  hold_expires_at timestamptz,
  cancelled_by text,
  feedback jsonb,
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
CREATE INDEX IF NOT EXISTS bookings_provider_email_idx ON soundstage.bookings(provider_email);
CREATE INDEX IF NOT EXISTS bookings_client_email_idx ON soundstage.bookings(client_email);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON soundstage.bookings(status);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap') THEN
    ALTER TABLE soundstage.bookings ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (provider_email WITH =, daterange(start_date, end_date) WITH &&)
      WHERE (status IN ('confirmed', 'in_progress'));
  END IF;
END $$;
ALTER TABLE soundstage.bookings ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS soundstage.booking_status_history (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES soundstage.bookings(id) ON DELETE RESTRICT,
  old_status text,
  new_status text NOT NULL,
  actor_id text,
  actor_role text NOT NULL CHECK (actor_role IN ('client', 'provider', 'admin', 'payroll_master', 'system')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_status_history_booking_idx ON soundstage.booking_status_history(booking_id);
ALTER TABLE soundstage.booking_status_history ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS soundstage.availability_schedules (
  id bigserial PRIMARY KEY,
  provider_email text NOT NULL CHECK (provider_email = lower(provider_email)),
  kind text NOT NULL CHECK (kind IN ('weekly', 'blocked')),
  weekday smallint CHECK (weekday BETWEEN 0 AND 6),
  blocked_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'weekly' AND weekday IS NOT NULL AND blocked_date IS NULL) OR (kind = 'blocked' AND blocked_date IS NOT NULL AND weekday IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS availability_weekly_unique ON soundstage.availability_schedules(provider_email, weekday) WHERE kind = 'weekly';
CREATE UNIQUE INDEX IF NOT EXISTS availability_blocked_unique ON soundstage.availability_schedules(provider_email, blocked_date) WHERE kind = 'blocked';
ALTER TABLE soundstage.availability_schedules ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS soundstage.reschedule_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES soundstage.bookings(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  new_start_date date NOT NULL,
  new_end_date date NOT NULL,
  requested_by text NOT NULL,
  decided_by text,
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (new_end_date > new_start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS reschedule_one_pending ON soundstage.reschedule_requests(booking_id) WHERE status = 'pending';
ALTER TABLE soundstage.reschedule_requests ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS soundstage.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES soundstage.bookings(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  requested_by text NOT NULL,
  decided_by text,
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cancellation_one_pending ON soundstage.cancellation_requests(booking_id) WHERE status = 'pending';
ALTER TABLE soundstage.cancellation_requests ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION soundstage.history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'booking_status_history is append-only';
END $$;
DROP TRIGGER IF EXISTS booking_status_history_append_only ON soundstage.booking_status_history;
CREATE TRIGGER booking_status_history_append_only BEFORE UPDATE OR DELETE ON soundstage.booking_status_history
  FOR EACH ROW EXECUTE FUNCTION soundstage.history_append_only();
CREATE OR REPLACE FUNCTION soundstage.booking_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.package_name IS DISTINCT FROM OLD.package_name
    OR NEW.package_inclusions IS DISTINCT FROM OLD.package_inclusions
    OR NEW.package_price IS DISTINCT FROM OLD.package_price THEN
    RAISE EXCEPTION 'booking package snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_snapshot_immutable ON soundstage.bookings;
CREATE TRIGGER bookings_snapshot_immutable BEFORE UPDATE ON soundstage.bookings
  FOR EACH ROW EXECUTE FUNCTION soundstage.booking_snapshot_immutable();
CREATE TABLE IF NOT EXISTS soundstage.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL CHECK (target_kind IN ('booking', 'subscription')),
  target_id text NOT NULL,
  owner_email text NOT NULL CHECK (owner_email = lower(owner_email)),
  type text NOT NULL CHECK (type IN ('downpayment', 'full', 'balance', 'subscription')),
  plan text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  refunded_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'review', 'partially_refunded', 'refunded')),
  checkout_session_id text UNIQUE,
  checkout_url text,
  method text,
  provider_reference text,
  review_reason text,
  legacy_id text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_pending ON soundstage.payments(target_id, type) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS payments_target_idx ON soundstage.payments(target_id);
CREATE INDEX IF NOT EXISTS payments_owner_idx ON soundstage.payments(owner_email);
ALTER TABLE soundstage.payments ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS soundstage.payment_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  payment_id uuid REFERENCES soundstage.payments(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE soundstage.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA soundstage FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundstage REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
INSERT INTO soundstage.schema_versions(version) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO soundstage.schema_versions(version) VALUES (2) ON CONFLICT DO NOTHING;
INSERT INTO soundstage.schema_versions(version) VALUES (3) ON CONFLICT DO NOTHING;
INSERT INTO soundstage.schema_versions(version) VALUES (4) ON CONFLICT DO NOTHING;
INSERT INTO soundstage.schema_versions(version) VALUES (5) ON CONFLICT DO NOTHING;
COMMIT;
