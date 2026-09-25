const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const path = require('node:path')
test('PostgreSQL migration is repeatable, preserves records and denies browser roles', async () => {
  const db = new PGlite()
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
    const schema = readFileSync('database/schema.sql', 'utf8')
    await db.exec(schema)
    await db.query('INSERT INTO soundstage.records(key,value) VALUES ($1,$2)', ['soundstage-test', { nested: { amount: 123, status: 'Pending' } }])
    await db.exec(schema)
    const result = await db.query('SELECT value FROM soundstage.records WHERE key=$1', ['soundstage-test'])
    assert.equal(result.rows[0].value.nested.amount, 123)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM soundstage.schema_versions')).rows[0].count, 3)
    await assert.rejects(db.query('INSERT INTO soundstage.records(key,value) VALUES ($1,$2)', ['invalid', {}]), /check constraint/)
    await assert.rejects(db.query('INSERT INTO soundstage.identities(auth_id,email,role) VALUES ($1,$2,$3)', ['00000000-0000-0000-0000-000000000001', 'a@test.com', 'admin']), /foreign key/)
    await db.exec('SET ROLE anon')
    await assert.rejects(db.query('SELECT * FROM soundstage.records'), /permission denied/)
    await db.exec('RESET ROLE; SET ROLE authenticated')
    await assert.rejects(db.query('SELECT * FROM soundstage.identities'), /permission denied/)
    await assert.rejects(db.query('SELECT * FROM soundstage.clerk_identities'), /permission denied/)
    await assert.rejects(db.query('SELECT * FROM soundstage.signup_phone_verifications'), /permission denied/)
    await db.exec('RESET ROLE')
  } finally { await db.close() }
})

test('full server workflows persist in PostgreSQL and roll back conflicting writes', async () => {
  const db = new PGlite()
  const tag = connection => {
    const query = async (parts, ...values) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), values)).rows
    query.json = value => JSON.stringify(value)
    return query
  }
  const sql = { begin: callback => db.transaction(tx => callback(tag(tx))) }
  const load = require('./ts-loader.cjs')({ [path.resolve('lib/server/database.ts')]: { getDatabase: () => sql } })
  const { execute } = load('lib/server/data-service.ts')
  const user = (n, role) => ({ id: '00000000-0000-0000-0000-' + String(n).padStart(12, '0'), email: role + '@test.com', email_confirmed_at: new Date().toISOString(), user_metadata: { firstName: role, lastName: 'Test', role, business: 'Events' }, app_metadata: role === 'admin' ? { role: 'admin' } : {} })
  const admin = user(1, 'admin'), provider = user(2, 'provider'), client = user(3, 'client'), outsider = user(4, 'outsider')
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
    await db.exec(readFileSync('database/schema.sql', 'utf8'))
    for (const u of [admin, provider, client, outsider]) await db.query('INSERT INTO auth.users(id) VALUES ($1)', [u.id])
    await execute(admin)
    await execute(provider, 'submitProviderApplication', [[{ name: 'permit.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0=' }]])
    const google = { id: 'user_google_provider', authSource: 'clerk', email: provider.email, app_metadata: { provider: 'google' }, user_metadata: {} }
    const clerkEmail = { ...google, app_metadata: { provider: 'email' } }
    const emailState = await execute(clerkEmail, undefined, [], 'client')
    assert.equal(JSON.parse(emailState.session['soundstage-session']).role, 'provider')
    assert.equal(JSON.parse(emailState.records['soundstage-accounts-v2']).find(a => a.email === provider.email).application.status, 'Pending')
    const googleState = await execute(google)
    assert.equal(JSON.parse(googleState.session['soundstage-session']).role, 'provider')
    assert.equal(JSON.parse(googleState.records['soundstage-accounts-v2']).find(a => a.email === provider.email).application.status, 'Pending')
    await assert.rejects(execute({ ...google, email: 'changed@test.com' }), /email changed/)
    await assert.rejects(execute({ ...google, id: 'user_admin_attempt', email: admin.email }), /administrator sign-in/)
    await assert.rejects(execute(client, 'reviewProviderApplication', [provider.email, 'Approved', '']), /permission/)
    await execute(admin, 'reviewProviderApplication', [provider.email, 'Approved', 'Checked'])
    await execute(provider, 'saveProviderService', [{ id: 'service-1', name: 'Lights', location: 'Balayan', price: 1000, active: true }])
    const publicState = await execute(null)
    assert.ok(publicState.records['soundstage-provider-services-v2:provider%40test.com'])
    assert.equal(JSON.stringify(publicState).includes('JVBERi0='), false)
    process.env.ENABLE_DEMO_PAYMENTS = 'true'
    const bookingInput = { packageId: 'service-1', date: '2027-01-02', time: '12:00', eventTown: 'Balayan', location: 'Venue', guests: 10, paymentMethod: 'GCash', total: 1 }
    const concurrent = await Promise.allSettled([execute(client, 'saveClientBooking', [bookingInput]), execute(outsider, 'saveClientBooking', [bookingInput])])
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(concurrent.filter(r => r.status === 'rejected').length, 1)
    const winner = concurrent.find(r => r.status === 'fulfilled').value.result
    assert.equal(winner.total, 1000)
    const saved = await execute(client)
    assert.equal(JSON.parse(saved.records['soundstage-client-bookings-v3:client%40test.com']).length, 1)
    const unrelated = await execute(outsider)
    assert.equal(unrelated.records['soundstage-client-bookings-v3:client%40test.com'], undefined)
    await assert.rejects(execute(outsider, 'updateClientBookingStatus', [winner.id, 'Cancelled']), /not found/)
    await execute(provider, 'updateClientBookingStatus', [winner.id, 'Confirmed'])
    await execute(provider, 'updateClientBookingStatus', [winner.id, 'Completed'])
    await execute(client, 'submitEventFeedback', [winner.id, 5, 'Excellent'])
    const finalState = await execute(admin)
    const finalBooking = JSON.parse(finalState.records['soundstage-client-bookings-v3:client%40test.com'])[0]
    assert.equal(finalBooking.status, 'Completed')
    assert.equal(finalBooking.feedback.rating, 5)
    await assert.rejects(execute(null, 'saveProviderService', [{}]), /Sign in/)
    await assert.rejects(execute(admin, 'constructor', []), /Unknown operation/)
    // Editable signup metadata must not grant administrator access.
    const hostile = { ...outsider, user_metadata: { ...outsider.user_metadata, role: 'admin' } }
    assert.equal(JSON.parse((await execute(hostile)).session['soundstage-session']).role, 'client')
    // A trusted promotion takes effect for an already-registered identity.
    const promoted = { ...outsider, app_metadata: { role: 'admin' } }
    assert.equal(JSON.parse((await execute(promoted)).session['soundstage-session']).role, 'admin')
    await assert.rejects(execute(outsider), /revoked/)
  } finally { delete process.env.ENABLE_DEMO_PAYMENTS; await db.close() }
})
