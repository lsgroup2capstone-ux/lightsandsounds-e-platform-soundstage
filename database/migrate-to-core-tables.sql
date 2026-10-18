-- SoundStage: move to the 11 core tables (data dictionary Tables 3-9 + messages,
-- refunds, notifications, audit_log). Run once in the Supabase SQL Editor.
-- It copies the existing users, service packages, subscriptions and activity,
-- then DELETES the old tables. Everything runs in one transaction: if any step
-- fails, nothing changes.
BEGIN;
SELECT pg_advisory_xact_lock(74832019);
DO $$ BEGIN
  IF to_regclass('soundstage.users') IS NOT NULL THEN RAISE EXCEPTION 'Already migrated: soundstage.users exists.'; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS soundstage;
REVOKE ALL ON SCHEMA soundstage FROM PUBLIC, anon, authenticated;

-- Old booking tables are empty; they are replaced by the new bookings table.
DROP TABLE IF EXISTS soundstage.payment_events, soundstage.payments, soundstage.booking_status_history, soundstage.reschedule_requests,
  soundstage.cancellation_requests, soundstage.availability_schedules, soundstage.bookings;
DROP FUNCTION IF EXISTS soundstage.history_append_only(), soundstage.booking_snapshot_immutable();

-- Rows of money and audit tables are never changed or deleted.
CREATE OR REPLACE FUNCTION soundstage.reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be %', TG_TABLE_NAME, lower(TG_OP) || 'd';
END $$;

-- Table 3: users. Passwords are kept by Clerk, never in this table.
CREATE TABLE IF NOT EXISTS soundstage.users (
  user_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clerk_user_id varchar(64) UNIQUE CHECK (clerk_user_id LIKE 'user_%'),
  first_name varchar(100) NOT NULL DEFAULT '',
  middle_name varchar(100),
  last_name varchar(100) NOT NULL DEFAULT '',
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email) AND email LIKE '%_@_%'),
  username varchar(100) UNIQUE,
  phone_number varchar(20),
  role varchar(50) NOT NULL CHECK (role IN ('client', 'provider', 'payroll_master', 'admin')),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
  business_name varchar(200),
  bio text,
  profile_image text,
  -- Provider verification (admin approval) and the two required documents (private file keys).
  verification_status varchar(20) CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  verification_reason text,
  business_permit text,
  valid_id text,
  email_notifications boolean NOT NULL DEFAULT true,
  date_created timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role = 'provider' OR verification_status IS NULL)
);

-- Table 4: service packages.
CREATE TABLE IF NOT EXISTS soundstage.service_packages (
  package_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  name varchar(100) NOT NULL,
  description text NOT NULL DEFAULT '',
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  inclusions text NOT NULL DEFAULT '',
  category varchar(50) CHECK (category IN ('Sound System', 'Lighting', 'Full Production', 'Band & Stage')),
  location varchar(200) NOT NULL DEFAULT '',
  coverage_areas text NOT NULL DEFAULT '',
  transportation_fee decimal(10,2) NOT NULL DEFAULT 0 CHECK (transportation_fee >= 0),
  image text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_packages_provider_idx ON soundstage.service_packages(provider_id);

-- Table 5: bookings. Includes the client's reschedule/cancellation request, the
-- client's report about the booking, and the payroll master's payout to the provider.
CREATE TABLE IF NOT EXISTS soundstage.bookings (
  booking_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  provider_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  package_id bigint NOT NULL REFERENCES soundstage.service_packages(package_id) ON DELETE RESTRICT,
  event_date date NOT NULL,
  duration_days smallint NOT NULL DEFAULT 1 CHECK (duration_days BETWEEN 1 AND 30),
  event_time time,
  end_time time,
  location varchar(150),
  event_town varchar(100),
  event_type varchar(100),
  guests integer CHECK (guests >= 0),
  notes text,
  -- Copied when booked so later package edits never change this booking.
  package_name varchar(100) NOT NULL,
  package_price decimal(10,2) NOT NULL CHECK (package_price >= 0),
  transportation_fee decimal(10,2) NOT NULL DEFAULT 0 CHECK (transportation_fee >= 0),
  total_amount decimal(10,2) NOT NULL CHECK (total_amount >= 0),
  status varchar(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'declined', 'cancelled', 'refund_pending', 'refunded')),
  hold_expires_at timestamptz,
  cancelled_by varchar(20) CHECK (cancelled_by IN ('client', 'provider', 'system')),
  cancel_reason text,
  request_type varchar(20) CHECK (request_type IN ('reschedule', 'cancellation')),
  request_status varchar(20) CHECK (request_status IN ('pending', 'approved', 'declined')),
  request_reason text,
  requested_date date,
  requested_duration_days smallint CHECK (requested_duration_days BETWEEN 1 AND 30),
  report_reason varchar(500),
  report_details text,
  report_status varchar(20) CHECK (report_status IN ('pending', 'resolved')),
  reported_at timestamptz,
  payout_status varchar(20) CHECK (payout_status IN ('pending', 'paid')),
  payout_amount decimal(10,2) CHECK (payout_amount >= 0),
  payout_reference varchar(100),
  paid_out_by bigint REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  paid_out_at timestamptz,
  idempotency_key varchar(100) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_id <> provider_id),
  CHECK ((request_type IS NULL) = (request_status IS NULL)),
  CHECK (request_type <> 'reschedule' OR requested_date IS NOT NULL),
  CHECK ((report_reason IS NULL) = (report_status IS NULL)),
  CHECK (payout_status <> 'paid' OR (payout_amount IS NOT NULL AND payout_reference IS NOT NULL AND paid_out_at IS NOT NULL)),
  -- A provider can never have two confirmed events on the same day.
  EXCLUDE USING gist (provider_id WITH =, daterange(event_date, event_date + duration_days) WITH &&) WHERE (status IN ('confirmed', 'in_progress'))
);
CREATE INDEX IF NOT EXISTS bookings_client_idx ON soundstage.bookings(client_id);
CREATE INDEX IF NOT EXISTS bookings_provider_idx ON soundstage.bookings(provider_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON soundstage.bookings(status);

-- Table 6: schedules. A dated row blocks or opens one day; a weekday row is a weekly working day.
CREATE TABLE IF NOT EXISTS soundstage.schedules (
  schedule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE CASCADE,
  available_date date,
  weekday smallint CHECK (weekday BETWEEN 0 AND 6),
  time_slot varchar(50),
  is_available boolean NOT NULL DEFAULT false,
  CHECK ((available_date IS NULL) <> (weekday IS NULL)),
  UNIQUE (provider_id, available_date),
  UNIQUE (provider_id, weekday)
);

-- Table 9: subscriptions. The 7-day trial is a row with plan_type 'Trial';
-- a plan waiting for its payment to be verified is 'pending'.
CREATE TABLE IF NOT EXISTS soundstage.subscriptions (
  subscription_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  plan_type varchar(20) NOT NULL CHECK (plan_type IN ('Trial', 'Starter', 'Pro', 'Studio')),
  price decimal(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('pending', 'trial', 'active', 'expired', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS subscriptions_provider_idx ON soundstage.subscriptions(provider_id);

-- Table 7: payments (bookings and subscriptions). Never deleted.
CREATE TABLE IF NOT EXISTS soundstage.payments (
  payment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id bigint REFERENCES soundstage.bookings(booking_id) ON DELETE RESTRICT,
  subscription_id bigint REFERENCES soundstage.subscriptions(subscription_id) ON DELETE RESTRICT,
  user_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  payment_type varchar(50) NOT NULL CHECK (payment_type IN ('downpayment', 'full', 'balance', 'subscription')),
  payment_method varchar(50),
  payment_status varchar(50) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'review', 'partially_refunded', 'refunded')),
  reference_number varchar(100),
  checkout_session_id varchar(100) UNIQUE,
  checkout_url text,
  refunded_amount decimal(10,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  review_reason text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((booking_id IS NULL) <> (subscription_id IS NULL)),
  CHECK ((payment_type = 'subscription') = (subscription_id IS NOT NULL)),
  CHECK (refunded_amount <= amount)
);
CREATE INDEX IF NOT EXISTS payments_booking_idx ON soundstage.payments(booking_id);
CREATE INDEX IF NOT EXISTS payments_user_idx ON soundstage.payments(user_id);
-- One open checkout per booking and payment type.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_pending ON soundstage.payments(booking_id, payment_type) WHERE payment_status = 'pending' AND booking_id IS NOT NULL;
DROP TRIGGER IF EXISTS payments_no_delete ON soundstage.payments;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON soundstage.payments FOR EACH ROW EXECUTE FUNCTION soundstage.reject_change();

-- Table 8: feedback. One review per booking, never edited.
CREATE TABLE IF NOT EXISTS soundstage.feedback (
  feedback_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL UNIQUE REFERENCES soundstage.bookings(booking_id) ON DELETE RESTRICT,
  client_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  provider_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL CHECK (char_length(btrim(comment)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_provider_idx ON soundstage.feedback(provider_id);
DROP TRIGGER IF EXISTS feedback_no_change ON soundstage.feedback;
CREATE TRIGGER feedback_no_change BEFORE UPDATE OR DELETE ON soundstage.feedback FOR EACH ROW EXECUTE FUNCTION soundstage.reject_change();

-- Table 10: messages. Client-provider chat about a booking.
CREATE TABLE IF NOT EXISTS soundstage.messages (
  message_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES soundstage.bookings(booking_id) ON DELETE RESTRICT,
  sender_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_booking_idx ON soundstage.messages(booking_id, created_at);

-- Table 11: refunds. Requested by the client, decided by the payroll master. Never deleted.
CREATE TABLE IF NOT EXISTS soundstage.refunds (
  refund_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES soundstage.bookings(booking_id) ON DELETE RESTRICT,
  client_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL DEFAULT '',
  payout_method varchar(50) NOT NULL CHECK (payout_method IN ('GCash', 'Maya', 'Bank transfer')),
  payout_account varchar(200) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'completed', 'rejected')),
  remarks text,
  reference_number varchar(100),
  decided_by bigint REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  completed_at timestamptz,
  CHECK (status <> 'completed' OR (reference_number IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (status <> 'rejected' OR remarks IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS refunds_one_open ON soundstage.refunds(booking_id) WHERE status IN ('requested', 'approved');
DROP TRIGGER IF EXISTS refunds_no_delete ON soundstage.refunds;
CREATE TRIGGER refunds_no_delete BEFORE DELETE ON soundstage.refunds FOR EACH ROW EXECUTE FUNCTION soundstage.reject_change();

-- Table 12: notifications shown in each user's bell.
CREATE TABLE IF NOT EXISTS soundstage.notifications (
  notification_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES soundstage.users(user_id) ON DELETE CASCADE,
  type varchar(50) NOT NULL,
  title varchar(200) NOT NULL,
  message text NOT NULL DEFAULT '',
  link varchar(500) CHECK (link LIKE '/%'),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON soundstage.notifications(user_id, created_at DESC);

-- Table 13: audit log. Who did what and when (approvals, refunds, payouts, status changes). Append-only.
CREATE TABLE IF NOT EXISTS soundstage.audit_log (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint REFERENCES soundstage.users(user_id) ON DELETE RESTRICT,
  actor_role varchar(50) NOT NULL CHECK (actor_role IN ('client', 'provider', 'payroll_master', 'admin', 'system')),
  action varchar(100) NOT NULL,
  table_name varchar(50) NOT NULL,
  record_id varchar(100) NOT NULL,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_record_idx ON soundstage.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON soundstage.audit_log(created_at);
DROP TRIGGER IF EXISTS audit_log_no_change ON soundstage.audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON soundstage.audit_log FOR EACH ROW EXECUTE FUNCTION soundstage.reject_change();

-- Copy existing data, if the old tables are present.
DO $$
BEGIN
  IF to_regclass('soundstage.profiles') IS NOT NULL AND to_regclass('soundstage.records') IS NOT NULL THEN
    INSERT INTO soundstage.users (clerk_user_id, first_name, last_name, email, phone_number, role, status, business_name, bio, profile_image,
      verification_status, verification_reason, business_permit, valid_id, date_created)
    SELECT p.clerk_user_id, left(coalesce(nullif(a.item->>'firstName', ''), p.first_name), 100), left(coalesce(nullif(a.item->>'lastName', ''), p.last_name), 100), p.email,
      left(coalesce(nullif(p.phone, ''), nullif(a.item->>'mobile', '')), 20), p.role, p.status, left(a.item->>'business', 200), a.item->>'bio', a.item->>'profileImage',
      CASE WHEN p.role = 'provider' THEN lower(a.item->'application'->>'status') END, CASE WHEN p.role = 'provider' THEN a.item->'application'->>'reason' END,
      CASE WHEN p.role = 'provider' THEN a.item->'application'->'documents'->0->>'key' END, CASE WHEN p.role = 'provider' THEN a.item->'application'->'documents'->1->>'key' END,
      p.created_at
    FROM soundstage.profiles p
    LEFT JOIN LATERAL (
      SELECT e AS item FROM soundstage.records r, jsonb_array_elements(r.value) e
      WHERE r.key = 'soundstage-accounts-v2' AND jsonb_typeof(r.value) = 'array' AND lower(e->>'email') = p.email
      ORDER BY (e->>'role' = p.role) DESC LIMIT 1
    ) a ON true;
  END IF;
  IF to_regclass('soundstage.records') IS NOT NULL THEN
    -- Accounts that never signed in through Clerk.
    INSERT INTO soundstage.users (first_name, last_name, email, phone_number, role, business_name, bio, profile_image, verification_status, verification_reason, business_permit, valid_id)
    SELECT DISTINCT ON (lower(e->>'email')) left(coalesce(e->>'firstName', ''), 100), left(coalesce(e->>'lastName', ''), 100), lower(btrim(e->>'email')), left(nullif(e->>'mobile', ''), 20), e->>'role',
      left(e->>'business', 200), e->>'bio', e->>'profileImage',
      CASE WHEN e->>'role' = 'provider' THEN lower(e->'application'->>'status') END, CASE WHEN e->>'role' = 'provider' THEN e->'application'->>'reason' END,
      CASE WHEN e->>'role' = 'provider' THEN e->'application'->'documents'->0->>'key' END, CASE WHEN e->>'role' = 'provider' THEN e->'application'->'documents'->1->>'key' END
    FROM soundstage.records r, jsonb_array_elements(r.value) e
    WHERE r.key = 'soundstage-accounts-v2' AND jsonb_typeof(r.value) = 'array' AND e->>'role' IN ('client', 'provider', 'payroll_master', 'admin') AND e->>'email' LIKE '%_@_%'
      AND NOT EXISTS (SELECT 1 FROM soundstage.users u WHERE u.email = lower(btrim(e->>'email')))
    ORDER BY lower(e->>'email');
    -- Service packages (record key is the provider email, URL-encoded).
    INSERT INTO soundstage.service_packages (provider_id, name, description, price, category, location, coverage_areas, transportation_fee, image, is_active)
    SELECT u.user_id, left(coalesce(s->>'name', 'Package'), 100), coalesce(s->>'description', ''), greatest(coalesce((s->>'price')::numeric, 0), 0),
      CASE WHEN s->>'category' IN ('Sound System', 'Lighting', 'Full Production', 'Band & Stage') THEN s->>'category' END,
      left(coalesce(s->>'location', ''), 200), coalesce(s->>'coverageAreas', s->>'location', ''), greatest(coalesce((s->>'transportationFee')::numeric, 0), 0),
      nullif(s->>'image', ''), coalesce(s->'active' = 'true'::jsonb, false)
    FROM soundstage.records r
    JOIN soundstage.users u ON u.role = 'provider' AND r.key = 'soundstage-provider-services-v2:' || replace(replace(u.email, '+', '%2B'), '@', '%40')
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.value) = 'array' THEN r.value ELSE '[]'::jsonb END) s;
    -- Blocked days.
    INSERT INTO soundstage.schedules (provider_id, available_date, is_available)
    SELECT DISTINCT u.user_id, d::date, false
    FROM soundstage.records r
    JOIN soundstage.users u ON u.role = 'provider' AND r.key = 'soundstage-schedule:' || replace(replace(u.email, '+', '%2B'), '@', '%40')
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.value) = 'array' THEN r.value ELSE '[]'::jsonb END) d
    WHERE d ~ '^\d{4}-\d{2}-\d{2}$';
    -- Subscriptions: a paid plan if paid, otherwise the trial.
    INSERT INTO soundstage.subscriptions (provider_id, plan_type, price, start_date, end_date, status)
    SELECT u.user_id, plan, CASE plan WHEN 'Starter' THEN 499 WHEN 'Pro' THEN 999 WHEN 'Studio' THEN 1999 ELSE 0 END,
      least(started::date, ends::date), ends::date,
      CASE WHEN ends <= now() THEN 'expired' WHEN plan = 'Trial' THEN 'trial' ELSE 'active' END
    FROM soundstage.records r
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.value->'subscriptions') = 'array' THEN r.value->'subscriptions' ELSE '[]'::jsonb END) s
    JOIN soundstage.users u ON u.role = 'provider' AND u.email = lower(btrim(s->>'email'))
    CROSS JOIN LATERAL (SELECT
      CASE WHEN s->>'paidUntil' IS NOT NULL AND s->>'plan' IN ('Starter', 'Pro', 'Studio') THEN s->>'plan' ELSE 'Trial' END AS plan,
      coalesce((s->>'trialStart')::timestamptz, now()) AS started,
      coalesce(CASE WHEN s->>'paidUntil' IS NOT NULL AND s->>'plan' IN ('Starter', 'Pro', 'Studio') THEN (s->>'paidUntil')::timestamptz END, (s->>'trialEnd')::timestamptz, now()) AS ends) x
    WHERE r.key = 'soundstage-marketplace-v1';
    -- Manual subscription payments.
    INSERT INTO soundstage.payments (subscription_id, user_id, amount, payment_type, payment_method, payment_status, reference_number, review_reason, paid_at, created_at)
    SELECT (SELECT max(subscription_id) FROM soundstage.subscriptions sb WHERE sb.provider_id = u.user_id), u.user_id, (p->>'amount')::numeric, 'subscription', p->>'method',
      CASE p->>'status' WHEN 'Paid' THEN 'paid' WHEN 'Rejected' THEN 'failed' ELSE 'pending' END, left(p->>'reference', 100),
      CASE WHEN p->>'status' = 'Rejected' THEN 'Rejected by reviewer' END, (p->>'paidAt')::timestamptz, coalesce((p->>'createdAt')::timestamptz, now())
    FROM soundstage.records r
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.value->'payments') = 'array' THEN r.value->'payments' ELSE '[]'::jsonb END) p
    JOIN soundstage.users u ON u.role = 'provider' AND u.email = lower(btrim(p->>'email'))
    WHERE r.key = 'soundstage-marketplace-v1' AND (p->>'amount')::numeric > 0
      AND EXISTS (SELECT 1 FROM soundstage.subscriptions sb WHERE sb.provider_id = u.user_id);
    -- Earlier activity entries.
    INSERT INTO soundstage.audit_log (actor_role, action, table_name, record_id, old_value, new_value, reason, created_at)
    SELECT 'system', left(coalesce(a->>'action', 'Activity'), 100), 'legacy', left(coalesce(nullif(a->>'target', ''), '-'), 100), a->>'before', a->>'after',
      'Recorded by ' || coalesce(a->>'actor', 'unknown'), coalesce((a->>'at')::timestamptz, now())
    FROM soundstage.records r
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.value->'audit') = 'array' THEN r.value->'audit' ELSE '[]'::jsonb END) WITH ORDINALITY AS e(a, n)
    WHERE r.key = 'soundstage-marketplace-v1'
    ORDER BY e.n DESC;
  END IF;
END $$;

-- Remove every old table that the 11 core tables replace.
DROP TABLE IF EXISTS soundstage.records, soundstage.profiles, soundstage.clerk_identities, soundstage.identities,
  soundstage.signup_phone_verifications, soundstage.schema_versions;

-- Private to the server: browser roles get no access (the app connects as the database owner).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'soundstage' LOOP
    EXECUTE format('ALTER TABLE soundstage.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA soundstage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA soundstage FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundstage REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
COMMIT;
