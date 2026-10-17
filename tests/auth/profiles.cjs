const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const path = require('node:path')
const createLoader = require('../helpers/ts-loader.cjs')

function tag(connection) {
  const query = async (parts, ...values) => (await connection.query(parts.reduce((sql, part, index) => sql + (index ? '$' + index : '') + part, ''), values)).rows
  query.json = value => JSON.stringify(value)
  return query
}

function identity(id, email) {
  return {
    id,
    authSource: 'clerk',
    email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: { firstName: 'Test', lastName: id.slice(5), mobile: '+639171234567', business: 'Test Events' },
  }
}

async function setup() {
  const db = new PGlite()
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('database/schema.sql', 'utf8'))
  const mirrors = []
  const sql = { begin: callback => db.transaction(transaction => callback(tag(transaction))) }
  const load = createLoader({
    '@clerk/backend': { createClerkClient: () => ({ users: { updateUserMetadata: async (id, value) => { mirrors.push({ id, value }) } } }) },
    [path.resolve('lib/server/db/database.ts')]: { getDatabase: () => sql },
    [path.resolve('lib/server/payments/paymongo.ts')]: require('../helpers/paymongo-fixture.cjs')(),
  })
  return { db, mirrors, execute: load('lib/server/data-service.ts').execute }
}

test('first Clerk requests create one client/provider profile and reject privileged signup roles', async () => {
  const { db, mirrors, execute } = await setup()
  try {
    const provider = identity('user_provider', 'provider@example.com')
    const client = identity('user_client', 'client@example.com')
    const requestedAdmin = identity('user_admin_request', 'admin-request@example.com')
    const requestedPayroll = identity('user_payroll_request', 'payroll-request@example.com')
    assert.equal(JSON.parse((await execute(provider, undefined, [], 'provider')).session['soundstage-session']).role, 'provider')
    assert.equal(JSON.parse((await execute(client, undefined, [], 'client')).session['soundstage-session']).role, 'client')
    assert.equal(JSON.parse((await execute(requestedAdmin, undefined, [], 'admin')).session['soundstage-session']).role, 'client')
    assert.equal(JSON.parse((await execute(requestedPayroll, undefined, [], 'payroll_master')).session['soundstage-session']).role, 'client')
    const rows = (await db.query('SELECT clerk_user_id,role FROM soundstage.profiles ORDER BY clerk_user_id')).rows
    assert.deepEqual(rows.map(row => row.role).sort(), ['client', 'client', 'client', 'provider'])
    assert.deepEqual(mirrors.map(item => item.value.publicMetadata.role).sort(), ['client', 'client', 'client', 'provider'])
  } finally { await db.close() }
})

test('legacy mapping wins, concurrent first requests stay singular, and inactive profiles are denied', async () => {
  const { db, mirrors, execute } = await setup()
  try {
    const legacy = identity('user_legacy_provider', 'legacy@example.com')
    await db.query('INSERT INTO soundstage.clerk_identities(clerk_id,email,role) VALUES ($1,$2,$3)', [legacy.id, legacy.email, 'provider'])
    assert.equal(JSON.parse((await execute(legacy, undefined, [], 'client')).session['soundstage-session']).role, 'provider')

    const concurrent = identity('user_concurrent', 'concurrent@example.com')
    const outcomes = await Promise.all([execute(concurrent, undefined, [], 'client'), execute(concurrent, undefined, [], 'client')])
    assert.equal(outcomes.length, 2)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM soundstage.profiles WHERE clerk_user_id=$1', [concurrent.id])).rows[0].count, 1)
    assert.equal(mirrors.filter(item => item.id === concurrent.id).length, 1)

    await db.query("UPDATE soundstage.profiles SET status='suspended' WHERE clerk_user_id=$1", [concurrent.id])
    await assert.rejects(execute(concurrent), error => error.status === 403 && /suspended/.test(error.message))
  } finally { await db.close() }
})

test('a profile email conflict is denied instead of merging Clerk identities', async () => {
  const { db, execute } = await setup()
  try {
    await db.query('INSERT INTO soundstage.profiles(clerk_user_id,email,role) VALUES ($1,$2,$3)', ['user_existing', 'same@example.com', 'client'])
    await assert.rejects(execute(identity('user_other', 'same@example.com')), error => error.status === 409 && /linked to another account/.test(error.message))
    assert.equal((await db.query("SELECT count(*)::int AS count FROM soundstage.profiles WHERE email='same@example.com'")).rows[0].count, 1)
  } finally { await db.close() }
})

test('migrated Supabase sessions are denied and former Supabase admins can use Clerk', async () => {
  const { db, execute } = await setup()
  try {
    const authId = '00000000-0000-0000-0000-000000000090'
    const email = 'migrated-admin@example.com'
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [authId])
    await db.query('INSERT INTO soundstage.identities(auth_id,email,role) VALUES ($1,$2,$3)', [authId, email, 'admin'])
    await db.query('INSERT INTO soundstage.profiles(clerk_user_id,email,role) VALUES ($1,$2,$3)', ['user_migrated_admin', email, 'admin'])
    const supabaseUser = { id: authId, email, email_confirmed_at: '2026-01-01', app_metadata: { role: 'admin' }, user_metadata: {} }
    await assert.rejects(execute(supabaseUser), error => error.status === 403 && /new sign-in/.test(error.message))

    const clerkUser = identity('user_migrated_admin', email)
    const response = await execute(clerkUser)
    assert.equal(JSON.parse(response.session['soundstage-session']).role, 'admin')
  } finally { await db.close() }
})
