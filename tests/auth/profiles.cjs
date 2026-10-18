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
  const db = new PGlite({ extensions: { btree_gist: require('@electric-sql/pglite/contrib/btree_gist').btree_gist } })
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
    const rows = (await db.query('SELECT clerk_user_id,role FROM soundstage.users ORDER BY clerk_user_id')).rows
    assert.deepEqual(rows.map(row => row.role).sort(), ['client', 'client', 'client', 'provider'])
    assert.deepEqual(mirrors.map(item => item.value.publicMetadata.role).sort(), ['client', 'client', 'client', 'provider'])
  } finally { await db.close() }
})

test('an existing user is linked by email and keeps its role; concurrent first requests stay singular; inactive users are denied', async () => {
  const { db, mirrors, execute } = await setup()
  try {
    // Users copied from the old tables have no Clerk id until their first sign-in.
    await db.query("INSERT INTO soundstage.users(email,first_name,last_name,role) VALUES ('legacy@example.com','Legacy','Admin','admin')")
    const legacy = identity('user_legacy_admin', 'legacy@example.com')
    assert.equal(JSON.parse((await execute(legacy, undefined, [], 'client')).session['soundstage-session']).role, 'admin')
    assert.equal((await db.query("SELECT clerk_user_id FROM soundstage.users WHERE email='legacy@example.com'")).rows[0].clerk_user_id, legacy.id)

    const concurrent = identity('user_concurrent', 'concurrent@example.com')
    const outcomes = await Promise.all([execute(concurrent, undefined, [], 'client'), execute(concurrent, undefined, [], 'client')])
    assert.equal(outcomes.length, 2)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM soundstage.users WHERE clerk_user_id=$1', [concurrent.id])).rows[0].count, 1)
    assert.equal(mirrors.filter(item => item.id === concurrent.id).length, 1)

    await db.query("UPDATE soundstage.users SET status='suspended' WHERE clerk_user_id=$1", [concurrent.id])
    await assert.rejects(execute(concurrent), error => error.status === 403 && /suspended/.test(error.message))
  } finally { await db.close() }
})

test('an email already linked to another Clerk account is denied instead of merging', async () => {
  const { db, execute } = await setup()
  try {
    await db.query("INSERT INTO soundstage.users(clerk_user_id,email,role) VALUES ('user_existing','same@example.com','client')")
    await assert.rejects(execute(identity('user_other', 'same@example.com')), error => error.status === 409 && /linked to another account/.test(error.message))
    assert.equal((await db.query("SELECT count(*)::int AS count FROM soundstage.users WHERE email='same@example.com'")).rows[0].count, 1)
  } finally { await db.close() }
})
