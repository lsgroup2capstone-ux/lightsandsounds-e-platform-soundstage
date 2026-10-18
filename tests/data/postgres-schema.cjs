const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const path = require('node:path')
const CORE_TABLES = ['audit_log', 'bookings', 'feedback', 'messages', 'notifications', 'payments', 'refunds', 'schedules', 'service_packages', 'subscriptions', 'users']

test('the schema creates exactly the 11 core tables, is repeatable, private and has no JSON columns', async () => {
  const db = new PGlite({ extensions: { btree_gist: require('@electric-sql/pglite/contrib/btree_gist').btree_gist } })
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
    const schema = readFileSync('database/schema.sql', 'utf8')
    await db.exec(schema)
    await db.query("INSERT INTO soundstage.users(email,role) VALUES ('kept@test.com','client')")
    await db.exec(schema)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM soundstage.users')).rows[0].n, 1)
    assert.deepEqual((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='soundstage' ORDER BY 1")).rows.map(r => r.tablename), CORE_TABLES)
    assert.deepEqual((await db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='soundstage' AND data_type IN ('json','jsonb')")).rows, [])
    for (const role of ['anon', 'authenticated']) {
      await db.exec('SET ROLE ' + role)
      for (const table of CORE_TABLES) await assert.rejects(db.query('SELECT * FROM soundstage.' + table), /permission denied/, table)
      await db.exec('RESET ROLE')
    }
    // Primary keys are numbers and every relationship is a foreign key.
    const fks = (await db.query("SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name WHERE tc.table_schema='soundstage' AND tc.constraint_type='FOREIGN KEY' ORDER BY 1, 2")).rows.map(r => r.table_name + '.' + r.column_name)
    for (const fk of ['service_packages.provider_id', 'bookings.client_id', 'bookings.provider_id', 'bookings.package_id', 'schedules.provider_id', 'payments.booking_id', 'payments.subscription_id', 'payments.user_id',
      'feedback.booking_id', 'feedback.client_id', 'feedback.provider_id', 'subscriptions.provider_id', 'messages.booking_id', 'messages.sender_id', 'refunds.booking_id', 'refunds.client_id', 'notifications.user_id', 'audit_log.user_id']) assert.ok(fks.includes(fk), fk)
    await assert.rejects(db.query("INSERT INTO soundstage.service_packages(provider_id,name,price) VALUES (999,'x',1)"), /foreign key/)
  } finally { await db.close() }
})

test('full server workflows persist in PostgreSQL and roll back conflicting writes', async () => {
  const db = new PGlite({ extensions: { btree_gist: require('@electric-sql/pglite/contrib/btree_gist').btree_gist } })
  const tag = connection => {
    const query = async (parts, ...values) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), values)).rows
    query.json = value => JSON.stringify(value)
    return query
  }
  const sql = { begin: callback => db.transaction(tx => callback(tag(tx))) }
  const load = require('../helpers/ts-loader.cjs')({ [path.resolve('lib/server/payments/paymongo.ts')]: require('../helpers/paymongo-fixture.cjs')(), [path.resolve('lib/server/db/database.ts')]: { getDatabase: () => sql } })
  const { execute } = load('lib/server/data-service.ts')
  const user = (n, role) => ({ id: '00000000-0000-0000-0000-' + String(n).padStart(12, '0'), email: role + '@test.com', email_confirmed_at: new Date().toISOString(), user_metadata: { firstName: role, lastName: 'Test', role, business: 'Events' }, app_metadata: role === 'admin' ? { role: 'admin' } : {} })
  const admin = user(1, 'admin'), provider = user(2, 'provider'), client = user(3, 'client'), outsider = user(4, 'outsider')
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
    await db.exec(readFileSync('database/schema.sql', 'utf8'))
    for (const u of [admin, provider, client, outsider]) await db.query('INSERT INTO auth.users(id) VALUES ($1)', [u.id])
    await execute(admin)
    const owner = require('node:crypto').createHash('sha256').update(provider.email).digest('hex').slice(0, 32)
    const r2Env = { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'AKID', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket', R2_PUBLIC_URL: 'https://pub.r2.dev' }
    const savedEnv = Object.fromEntries(Object.keys(r2Env).map(name => [name, process.env[name]])), realFetch = global.fetch
    Object.assign(process.env, r2Env)
    global.fetch = async () => new Response(null, { status: 200, headers: { 'content-length': '10', 'content-type': 'application/pdf' } })
    const doc = (name, n) => ({ name, type: 'application/pdf', key: `private/provider-docs/${owner}/${String(n).repeat(32)}.pdf`, size: 10 })
    try { await execute(provider, 'submitProviderApplication', [[doc('permit.pdf', 0), doc('id.pdf', 1)]]) }
    finally { global.fetch = realFetch; for (const [name, value] of Object.entries(savedEnv)) if (value === undefined) delete process.env[name]; else process.env[name] = value }
    const google = { id: 'user_google_provider', authSource: 'clerk', email: provider.email, app_metadata: { provider: 'google' }, user_metadata: {} }
    const clerkEmail = { ...google, app_metadata: { provider: 'email' } }
    const emailState = await execute(clerkEmail, undefined, [], 'client')
    assert.equal(JSON.parse(emailState.session['soundstage-session']).role, 'provider')
    assert.equal(JSON.parse(emailState.records['soundstage-accounts-v2']).find(a => a.email === provider.email).application.status, 'Pending')
    const googleState = await execute(google)
    assert.equal(JSON.parse(googleState.session['soundstage-session']).role, 'provider')
    assert.equal(JSON.parse(googleState.records['soundstage-accounts-v2']).find(a => a.email === provider.email).application.status, 'Pending')
    await assert.rejects(execute({ ...google, email: 'changed@test.com' }), /email changed/)
    // The admin row exists from the earlier sign-in; the first Clerk sign-in links to it by email.
    const clerkAdmin = { ...google, id: 'user_admin_attempt', email: admin.email }
    const migratedAdmin = await execute(clerkAdmin)
    assert.equal(JSON.parse(migratedAdmin.session['soundstage-session']).role, 'admin')
    await assert.rejects(execute(client, 'reviewProviderApplication', [provider.email, 'Approved', '']), /permission/)
    await execute(clerkAdmin, 'reviewProviderApplication', [provider.email, 'Approved', 'Checked'])
    await execute(google, 'saveProviderService', [{ id: 'service-1', name: 'Lights', location: 'Balayan', price: 1000, active: true }])
    const publicState = await execute(null)
    assert.ok(publicState.records['soundstage-provider-services-v2:provider%40test.com'])
    const serviceId = JSON.parse(publicState.records['soundstage-provider-services-v2:provider%40test.com'])[0].id
    assert.match(serviceId, /^\d+$/)
    const [account] = (await db.query("SELECT verification_status, business_permit, valid_id FROM soundstage.users WHERE email = 'provider@test.com'")).rows
    assert.deepEqual([account.verification_status, account.business_permit.endsWith('0'.repeat(32) + '.pdf'), account.valid_id.endsWith('1'.repeat(32) + '.pdf')], ['approved', true, true])
    assert.equal(JSON.stringify(publicState).includes('JVBERi0='), false)
    // Booking plan 4 (T4.1): request → accept → webhook pays → confirmed → complete → feedback, all through execute().
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const bookingInput = { packageId: serviceId, date: today, time: '12:00', eventTown: 'Balayan', location: 'Venue', guests: 10, total: 1, downpayment: 1, status: 'confirmed', paid: true }
    const created = await Promise.allSettled([execute(client, 'saveClientBooking', [{ ...bookingInput, idempotencyKey: 'pg-1' }]), execute(outsider, 'saveClientBooking', [{ ...bookingInput, idempotencyKey: 'pg-2' }])])
    assert.deepEqual(created.map(r => r.status), ['fulfilled', 'fulfilled'])
    const winner = created[0].value.result, otherBooking = created[1].value.result
    assert.deepEqual(Object.keys(winner), ['id'])
    assert.equal((await execute(client, 'saveClientBooking', [{ ...bookingInput, idempotencyKey: 'pg-1' }])).result.id, winner.id)
    const [stored] = (await db.query('SELECT status, total_amount::float AS total FROM soundstage.bookings WHERE booking_id = $1', [winner.id])).rows
    assert.deepEqual(stored, { status: 'pending', total: 1000 })
    const saved = await execute(client)
    assert.equal(JSON.parse(saved.records['soundstage-client-bookings-v3:client%40test.com']).length, 1)
    assert.equal(JSON.parse(saved.records['soundstage-client-bookings-v3:client%40test.com'])[0].status, 'pending')
    const unrelated = await execute(outsider)
    assert.equal(unrelated.records['soundstage-client-bookings-v3:client%40test.com'], undefined)
    await assert.rejects(execute(outsider, 'updateClientBookingStatus', [winner.id, 'Cancelled']), /not found/)
    assert.deepEqual((await execute(client, 'getBookingAvailability', [serviceId])).result, [])
    const accepted = await Promise.allSettled([
      execute(google, 'updateClientBookingStatus', [winner.id, 'Confirmed']),
      execute(google, 'acceptBooking', [otherBooking.id]),
    ])
    assert.equal(accepted[0].status, 'fulfilled')
    assert.equal(accepted[1].status, 'rejected')
    assert.match(accepted[1].reason.message, /already booked/)
    assert.deepEqual((await execute(client, 'getBookingAvailability', [serviceId])).result, [today])
    const started = (await execute(client, 'startBookingPayment', [winner.id, 'downpayment', 'GCash'])).result
    await assert.rejects(execute(client, 'startBookingPayment', [winner.id, 'downpayment', 'GCash', 1]), /Invalid input/)
    const webhook = load('lib/server/payments/webhook.ts')
    const event = { id: 'evt_pg_1', type: 'checkout_session.payment.paid', data: { id: 'cs_' + started.id, attributes: { reference_number: started.id, livemode: false, payments: [{ id: 'pay_pg_1', attributes: { status: 'paid', currency: 'PHP', amount: 30000, source: { type: 'gcash' } } }] } } }
    await execute(null, undefined, [], undefined, () => webhook.processEvent(event))
    const paidView = JSON.parse((await execute(client)).records['soundstage-client-bookings-v3:client%40test.com'])[0]
    assert.equal(paidView.status, 'confirmed')
    assert.equal(paidView.paid, true)
    await execute(google, 'updateClientBookingStatus', [winner.id, 'Completed'])
    await execute(client, 'submitEventFeedback', [winner.id, 5, 'Excellent'])
    await assert.rejects(execute(client, 'submitEventFeedback', [winner.id, 4, 'Again']), /already/)
    const history = (await db.query("SELECT new_value AS new_status, actor_role FROM soundstage.audit_log WHERE table_name = 'bookings' AND record_id = $1 AND action = 'Booking status changed' ORDER BY audit_id", [winner.id])).rows
    assert.deepEqual(history.map(h => h.new_status), ['pending', 'accepted', 'awaiting_payment', 'confirmed', 'in_progress', 'completed'])
    assert.deepEqual((await db.query('SELECT rating, comment FROM soundstage.feedback WHERE booking_id = $1', [winner.id])).rows, [{ rating: 5, comment: 'Excellent' }])
    assert.equal(history[3].actor_role, 'system')
    // Refund decisions are payroll master only (AC26).
    await assert.rejects(execute(clerkAdmin, 'reviewBookingRefund', [winner.id, 'Paid', 'REF-1']), /permission/)
    const finalState = await execute(clerkAdmin)
    const finalBooking = JSON.parse(finalState.records['soundstage-client-bookings-v3:client%40test.com'])[0]
    assert.equal(finalBooking.status, 'completed')
    assert.equal(finalBooking.feedback.rating, 5)
    // Every screen record came from the 11 tables; the old JSON store no longer exists.
    assert.equal((await db.query("SELECT to_regclass('soundstage.records') IS NULL AS gone")).rows[0].gone, true)
    await assert.rejects(execute(null, 'saveProviderService', [{}]), /Sign in/)
    await assert.rejects(execute(clerkAdmin, 'constructor', []), /Unknown operation/)
    // Editable signup metadata must not grant administrator access.
    const hostile = { ...outsider, user_metadata: { ...outsider.user_metadata, role: 'admin' } }
    assert.equal(JSON.parse((await execute(hostile)).session['soundstage-session']).role, 'client')
    // A trusted promotion takes effect for an already-registered identity.
    const promoted = { ...outsider, app_metadata: { role: 'admin' } }
    assert.equal(JSON.parse((await execute(promoted)).session['soundstage-session']).role, 'admin')
    await assert.rejects(execute(outsider), /revoked/)
  } finally { await db.close() }
})

test('the database enforces booking statuses, no double booking, and unchangeable money and audit rows', async () => {
  const { openDatabase, seed, insertBooking } = require('../helpers/seed.cjs')
  const db = await openDatabase()
  try {
    const ids = await seed(db, { users: [{ email: 'c@test.com', role: 'client' }, { email: 'p@test.com', role: 'provider' }, { email: 'o@test.com', role: 'provider' }], packages: [{ key: 'pkg', provider: 'p@test.com' }, { key: 'other', provider: 'o@test.com' }] })
    const book = (date, status, provider = 'p@test.com', pkg = 'pkg', days = 2) => insertBooking(db, ids, { client: 'c@test.com', provider, pkg, date, days, status })
    await assert.rejects(book('2027-11-01', 'paid'), /check constraint/)
    const first = await book('2027-11-01', 'confirmed')
    await assert.rejects(book('2027-11-02', 'confirmed'), error => error.code === '23P01')
    await assert.rejects(book('2027-11-01', 'in_progress', 'p@test.com', 'pkg', 1), error => error.code === '23P01')
    await book('2027-11-03', 'confirmed')
    await book('2027-11-01', 'confirmed', 'o@test.com', 'other')
    await book('2027-11-01', 'pending')
    await assert.rejects(db.query("UPDATE soundstage.bookings SET request_type = 'reschedule', request_status = 'pending' WHERE booking_id = $1", [first]), /check constraint/)
    await db.query("INSERT INTO soundstage.payments (booking_id, user_id, payment_type, amount, payment_status) VALUES ($1, $2, 'downpayment', 3000, 'paid')", [first, ids['c@test.com']])
    await assert.rejects(db.query("INSERT INTO soundstage.payments (booking_id, user_id, payment_type, amount) VALUES ($1, $2, 'downpayment', 3000)", [first, ids['c@test.com']]).then(() => db.query("INSERT INTO soundstage.payments (booking_id, user_id, payment_type, amount) VALUES ($1, $2, 'downpayment', 3000)", [first, ids['c@test.com']])), /duplicate key/)
    await assert.rejects(db.query('DELETE FROM soundstage.payments'), /cannot be deleted/)
    await assert.rejects(db.query('UPDATE soundstage.payments SET refunded_amount = 3001'), /check constraint/)
    await db.query("INSERT INTO soundstage.refunds (booking_id, client_id, amount, payout_method, payout_account) VALUES ($1, $2, 3000, 'GCash', '0917')", [first, ids['c@test.com']])
    await assert.rejects(db.query("INSERT INTO soundstage.refunds (booking_id, client_id, amount, payout_method, payout_account) VALUES ($1, $2, 3000, 'GCash', '0917')", [first, ids['c@test.com']]), /duplicate key/)
    await assert.rejects(db.query("UPDATE soundstage.refunds SET status = 'completed'"), /check constraint/)
    await assert.rejects(db.query('DELETE FROM soundstage.refunds'), /cannot be deleted/)
    await db.query("INSERT INTO soundstage.audit_log (actor_role, action, table_name, record_id) VALUES ('system', 'Test', 'bookings', $1)", [first])
    await assert.rejects(db.query("UPDATE soundstage.audit_log SET action = 'x'"), /cannot be updated/)
    await assert.rejects(db.query('DELETE FROM soundstage.audit_log'), /cannot be deleted/)
    await db.query("INSERT INTO soundstage.feedback (booking_id, client_id, provider_id, rating, comment) VALUES ($1, $2, $3, 5, 'Great')", [first, ids['c@test.com'], ids['p@test.com']])
    await assert.rejects(db.query("INSERT INTO soundstage.feedback (booking_id, client_id, provider_id, rating, comment) VALUES ($1, $2, $3, 4, 'Again')", [first, ids['c@test.com'], ids['p@test.com']]), /duplicate key/)
    await assert.rejects(db.query('UPDATE soundstage.feedback SET rating = 1'), /cannot be updated/)
    await assert.rejects(db.query("INSERT INTO soundstage.schedules (provider_id, available_date, weekday) VALUES ($1, '2027-01-01', 1)", [ids['p@test.com']]), /check constraint/)
    await assert.rejects(db.query("INSERT INTO soundstage.subscriptions (provider_id, plan_type, start_date, end_date, status) VALUES ($1, 'Gold', current_date, current_date, 'active')", [ids['p@test.com']]), /check constraint/)
  } finally { await db.close() }
})
