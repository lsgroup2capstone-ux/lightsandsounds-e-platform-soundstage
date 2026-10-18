const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist')
const { openDatabase, seed, insertBooking } = require('../helpers/seed.cjs')
const tables = require('../helpers/record-tables.cjs')
const store = require('../helpers/ts-loader.cjs')()('lib/server/db/record-store.ts')

const save = (db, before, after) => db.transaction(tx => store.saveRecords(tables.tag(tx), before, after))

test('screen records are written to and read back from the 11 tables', async () => {
  const db = await openDatabase()
  try {
    const ids = await seed(db, { users: [{ email: 'c@test.com', role: 'client', first: 'Cy', last: 'Client' }, { email: 'p@test.com', role: 'provider', business: 'Pat Sound', status: 'pending' }, { email: 'pm@test.com', role: 'payroll_master' }] })
    const empty = await tables.readRecords(db)
    const accounts = JSON.parse(empty['soundstage-accounts-v2'])
    // Profile and provider application map to users columns (Table 3).
    const provider = accounts.find(a => a.email === 'p@test.com')
    provider.mobile = '09171234567'
    provider.application = { status: 'Pending', documents: [{ name: 'permit.pdf', type: 'application/pdf', key: 'private/provider-docs/x/permit.pdf', size: 9 }, { name: 'id.png', type: 'image/png', key: 'private/provider-docs/x/id.png', size: 9 }], submittedAt: new Date().toISOString() }
    const services = [{ id: 'new-1', name: 'Lights', location: 'Balayan', coverageAreas: 'Balayan, Lemery', transportationFee: 250, description: 'Big', price: 1500.5, image: '', providerName: 'Pat Sound', active: true, bookings: 0, category: 'Lighting' }]
    const now = new Date().toISOString()
    const after = { ...empty,
      'soundstage-accounts-v2': JSON.stringify(accounts),
      'soundstage-provider-services-v2:p%40test.com': JSON.stringify(services),
      'soundstage-marketplace-v1': JSON.stringify({ subscriptions: [{ email: 'p@test.com', trialStart: now, trialEnd: new Date(Date.now() + 7 * 864e5).toISOString() }],
        payments: [{ id: 'tmp-1', email: 'p@test.com', customer: 'Pat Sound', plan: 'Pro', amount: 999, method: 'GCash', reference: 'GC-123456', status: 'Pending', createdAt: now }],
        audit: [{ id: 'tmp-a', actor: 'provider: Pat Sound (p@test.com)', action: 'Subscription payment submitted', target: 'tmp-1', before: 'New', after: 'Pending', at: now }] }),
      'soundstage-event-notifications:client:c@test.com': JSON.stringify(['completed-1']),
      'soundstage-schedule:p%40test.com': JSON.stringify(['2027-05-01']),
    }
    await save(db, empty, after)
    const [user] = (await db.query("SELECT phone_number, verification_status, business_permit, valid_id FROM soundstage.users WHERE email='p@test.com'")).rows
    assert.deepEqual(user, { phone_number: '09171234567', verification_status: 'pending', business_permit: 'private/provider-docs/x/permit.pdf', valid_id: 'private/provider-docs/x/id.png' })
    const [pkg] = (await db.query('SELECT package_id, provider_id, name, price::float AS price, category, transportation_fee::float AS fee FROM soundstage.service_packages')).rows
    assert.deepEqual({ ...pkg, package_id: undefined }, { package_id: undefined, provider_id: Number(ids['p@test.com']), name: 'Lights', price: 1500.5, category: 'Lighting', fee: 250 })
    assert.deepEqual((await db.query('SELECT plan_type, status FROM soundstage.subscriptions ORDER BY subscription_id')).rows, [{ plan_type: 'Trial', status: 'trial' }, { plan_type: 'Pro', status: 'pending' }])
    assert.deepEqual((await db.query("SELECT payment_type, payment_status, payment_method, reference_number, booking_id FROM soundstage.payments")).rows, [{ payment_type: 'subscription', payment_status: 'pending', payment_method: 'GCash', reference_number: 'GC-123456', booking_id: null }])
    assert.deepEqual((await db.query('SELECT actor_role, action, record_id FROM soundstage.audit_log')).rows, [{ actor_role: 'provider', action: 'Subscription payment submitted', record_id: 'tmp-1' }])
    assert.deepEqual((await db.query('SELECT type, title, is_read FROM soundstage.notifications')).rows, [{ type: 'read_receipt', title: 'completed-1', is_read: true }])
    assert.deepEqual((await db.query("SELECT to_char(available_date,'YYYY-MM-DD') AS d, is_available FROM soundstage.schedules")).rows, [{ d: '2027-05-01', is_available: false }])
    // Read back: the browser ids become the tables' numbers; everything else keeps its shape.
    const loaded = await tables.readRecords(db)
    const service = JSON.parse(loaded['soundstage-provider-services-v2:p%40test.com'])[0]
    assert.equal(service.id, String(pkg.package_id))
    assert.deepEqual({ ...service, id: 'new-1' }, services[0])
    const billing = JSON.parse(loaded['soundstage-marketplace-v1'])
    assert.equal(billing.payments[0].status, 'Pending')
    assert.equal(billing.payments[0].plan, 'Pro')
    assert.equal(billing.subscriptions[0].plan, undefined)
    assert.equal(billing.audit[0].actor, 'provider: provider Test (p@test.com)')
    assert.deepEqual(JSON.parse(loaded['soundstage-event-notifications:client:c@test.com']), ['completed-1'])
    assert.deepEqual(JSON.parse(loaded['soundstage-accounts-v2']).find(a => a.email === 'p@test.com').application.documents.map(d => d.key), ['private/provider-docs/x/permit.pdf', 'private/provider-docs/x/id.png'])
    // The payroll master approves the payment: the pending plan becomes active (Table 9).
    const approved = JSON.parse(loaded['soundstage-marketplace-v1'])
    approved.payments[0] = { ...approved.payments[0], status: 'Paid', paidAt: new Date().toISOString(), invoice: 'SI-' + approved.payments[0].id }
    approved.subscriptions[0] = { ...approved.subscriptions[0], plan: 'Pro', paidUntil: new Date(Date.now() + 30 * 864e5).toISOString() }
    await save(db, loaded, { ...loaded, 'soundstage-marketplace-v1': JSON.stringify(approved) })
    assert.deepEqual((await db.query("SELECT plan_type, status FROM soundstage.subscriptions WHERE plan_type = 'Pro'")).rows, [{ plan_type: 'Pro', status: 'active' }])
    assert.equal((await db.query('SELECT payment_status FROM soundstage.payments')).rows[0].payment_status, 'paid')
    // Messages and reports belong to a booking.
    const pkgKey = { pkg: String(pkg.package_id) }
    const booking = await insertBooking(db, { ...ids, ...pkgKey }, { client: 'c@test.com', provider: 'p@test.com', pkg: 'pkg', date: '2027-06-01', status: 'confirmed' })
    const current = await tables.readRecords(db)
    await save(db, current, { ...current,
      'soundstage-booking-messages-v1': JSON.stringify([{ id: 'MSG-x', bookingId: booking, client: 'x', provider: 'x', senderRole: 'client', senderName: 'x', body: 'Hello', createdAt: now }]),
      'soundstage-provider-reports-v1': JSON.stringify([{ id: 'RPT-x', bookingId: booking, client: 'x', clientEmail: 'c@test.com', provider: 'x', reason: 'Late', details: 'Arrived late', status: 'Pending', createdAt: now }]) })
    const final = await tables.readRecords(db)
    assert.deepEqual(JSON.parse(final['soundstage-booking-messages-v1']).map(m => [m.bookingId, m.senderRole, m.senderName, m.body]), [[booking, 'client', 'Cy Client', 'Hello']])
    assert.deepEqual(JSON.parse(final['soundstage-provider-reports-v1']).map(r => [r.id, r.provider, r.status]), [['RPT-' + booking, 'Pat Sound', 'Pending']])
    const reports = JSON.parse(final['soundstage-provider-reports-v1'])
    await assert.rejects(save(db, final, { ...final, 'soundstage-provider-reports-v1': JSON.stringify([{ ...reports[0], id: 'RPT-y', reason: 'Again' }, ...reports]) }), /already submitted/)
    await save(db, final, { ...final, 'soundstage-provider-reports-v1': JSON.stringify([{ ...reports[0], status: 'Resolved' }]) })
    assert.equal((await db.query('SELECT report_status FROM soundstage.bookings')).rows[0].report_status, 'resolved')
    await assert.rejects(save(db, {}, { 'soundstage-unknown': '[]' }), /Unsupported record key/)
    await assert.rejects(save(db, {}, { 'soundstage-withdrawals-v1': '[{"id":"w"}]' }), /replaced by payouts/)
  } finally { await db.close() }
})

// The old Supabase layout the migration starts from (only the parts it reads).
const OLD = `CREATE SCHEMA soundstage;
CREATE TABLE soundstage.schema_versions (version integer PRIMARY KEY);
CREATE TABLE soundstage.records (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE soundstage.profiles (clerk_user_id text PRIMARY KEY, email text NOT NULL UNIQUE, first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
  role text NOT NULL, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE soundstage.identities (email text);
CREATE TABLE soundstage.clerk_identities (email text);
CREATE TABLE soundstage.signup_phone_verifications (phone text);
CREATE TABLE soundstage.bookings (id uuid PRIMARY KEY);`
const columns = async db => (await db.query("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'soundstage' ORDER BY table_name, ordinal_position")).rows
  .map(c => ({ ...c, column_default: c.column_default?.replace(/nextval\('[^']+'::regclass\)/, 'nextval') }))

test('the Supabase migration copies the old data, deletes the old tables and matches schema.sql', async () => {
  const fresh = await openDatabase()
  const db = new PGlite({ extensions: { btree_gist } })
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);' + OLD)
    const provider = 'fran+provider1@gmail.com', now = Date.now(), iso = d => new Date(d).toISOString()
    for (const [id, email, role] of [['user_a', 'admin@x.com', 'admin'], ['user_c', 'c@x.com', 'client'], ['user_p', provider, 'provider']]) await db.query("INSERT INTO soundstage.profiles(clerk_user_id,email,first_name,last_name,role) VALUES ($1,$2,'New','User',$3)", [id, email, role])
    const records = {
      'soundstage-accounts-v2': [{ email: 'c@x.com', role: 'client', firstName: 'Cy', lastName: 'Client', mobile: '0917' }, { email: provider, role: 'provider', firstName: 'Fran', lastName: 'P', business: 'Fran Sounds',
        application: { status: 'Approved', documents: [{ key: 'private/provider-docs/a/permit.pdf' }, { key: 'private/provider-docs/a/id.png' }] } }, { email: 'legacy@x.com', role: 'client', firstName: 'Old', lastName: 'Account' }],
      'soundstage-marketplace-v1': { subscriptions: [{ email: provider, trialStart: iso(now - 2 * 864e5), trialEnd: iso(now + 5 * 864e5) }], payments: [], audit: [{ id: 'a2', actor: 'someone without an email', action: 'Old entry', target: 'x', at: iso(now - 864e5) }, { id: 'a1', actor: 'admin: Admin (admin@x.com)', action: 'Provider application reviewed', target: provider, before: 'Pending', after: 'Approved', at: iso(now) }] },
      'soundstage-provider-services-v2:fran%2Bprovider1%40gmail.com': [{ id: 'svc-1', name: 'Pro Sound', price: 15000, location: 'Balayan', coverageAreas: 'Balayan', active: true, category: 'Sound System' }],
      'soundstage-schedule:fran%2Bprovider1%40gmail.com': ['2027-01-02'],
    }
    for (const [key, value] of Object.entries(records)) await db.query('INSERT INTO soundstage.records(key,value) VALUES ($1,$2)', [key, JSON.stringify(value)])
    const migration = readFileSync('database/migrate-to-core-tables.sql', 'utf8')
    await db.exec(migration)
    assert.deepEqual(await columns(db), await columns(fresh))
    const users = (await db.query('SELECT clerk_user_id, email, first_name, role, business_name, verification_status, business_permit, valid_id FROM soundstage.users ORDER BY user_id')).rows
    assert.deepEqual(users.map(u => [u.clerk_user_id, u.email, u.first_name, u.role]), [['user_a', 'admin@x.com', 'New', 'admin'], ['user_c', 'c@x.com', 'Cy', 'client'], ['user_p', provider, 'Fran', 'provider'], [null, 'legacy@x.com', 'Old', 'client']])
    assert.deepEqual([users[2].business_name, users[2].verification_status, users[2].business_permit, users[2].valid_id], ['Fran Sounds', 'approved', 'private/provider-docs/a/permit.pdf', 'private/provider-docs/a/id.png'])
    assert.deepEqual((await db.query('SELECT name, price::float AS price, category, is_active FROM soundstage.service_packages')).rows, [{ name: 'Pro Sound', price: 15000, category: 'Sound System', is_active: true }])
    assert.deepEqual((await db.query('SELECT plan_type, status FROM soundstage.subscriptions')).rows, [{ plan_type: 'Trial', status: 'trial' }])
    assert.deepEqual((await db.query("SELECT to_char(available_date,'YYYY-MM-DD') AS d FROM soundstage.schedules")).rows, [{ d: '2027-01-02' }])
    // The person in each old entry is linked by email; entries without one keep the text in reason.
    assert.deepEqual((await db.query('SELECT u.email, a.actor_role, a.reason FROM soundstage.audit_log a LEFT JOIN soundstage.users u ON u.user_id = a.user_id ORDER BY a.audit_id')).rows,
      [{ email: 'admin@x.com', actor_role: 'admin', reason: null }, { email: null, actor_role: 'system', reason: 'Recorded by someone without an email' }])
    for (const old of ['records', 'profiles', 'identities', 'clerk_identities', 'signup_phone_verifications', 'schema_versions']) assert.equal((await db.query('SELECT to_regclass($1) IS NULL AS gone', ['soundstage.' + old])).rows[0].gone, true, old)
    // Running it twice stops before changing anything.
    await assert.rejects(db.exec(migration), /Already migrated/)
    await db.exec('ROLLBACK').catch(() => {})
    assert.equal((await db.query('SELECT count(*)::int AS n FROM soundstage.users')).rows[0].n, 4)
  } finally { await db.close(); await fresh.close() }
})
