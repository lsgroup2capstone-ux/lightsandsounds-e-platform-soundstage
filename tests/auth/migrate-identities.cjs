const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { migrateIdentities } = require('../../scripts/auth/migrate-identities-to-profiles.cjs')

function tag(connection) {
  const query = async (parts, ...values) => (await connection.query(parts.reduce((text, part, index) => text + (index ? '$' + index : '') + part, ''), values)).rows
  return query
}

async function setup() {
  const db = new PGlite()
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('database/schema.sql', 'utf8'))
  const roles = [['00000000-0000-0000-0000-000000000001', 'admin@example.com', 'admin'], ['00000000-0000-0000-0000-000000000002', 'client@example.com', 'client'], ['00000000-0000-0000-0000-000000000003', 'provider@example.com', 'provider']]
  for (const [id, email, role] of roles) {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [id])
    await db.query('INSERT INTO soundstage.identities(auth_id,email,role) VALUES ($1,$2,$3)', [id, email, role])
  }
  await db.query('INSERT INTO soundstage.records(key,value) VALUES ($1,$2)', ['soundstage-accounts-v2', [{ email: 'client@example.com', firstName: 'Client', lastName: 'Person' }]])
  const created = [], mirrored = []
  const existing = { id: 'user_provider', primaryEmailAddressId: 'email_provider', emailAddresses: [{ id: 'email_provider', emailAddress: 'provider@example.com', verification: { status: 'verified' } }] }
  const users = new Map([['provider@example.com', existing]])
  const clerk = { users: {
    getUserList: async ({ emailAddress }) => ({ data: users.has(emailAddress[0]) ? [users.get(emailAddress[0])] : [] }),
    createUser: async input => {
      created.push(input)
      const email = input.emailAddress[0], id = `user_${email.split('@')[0]}`
      const user = { id, primaryEmailAddressId: `email_${id}`, emailAddresses: [{ id: `email_${id}`, emailAddress: email, verification: { status: 'verified' } }] }
      users.set(email, user)
      return user
    },
    updateUserMetadata: async (id, metadata) => { mirrored.push({ id, metadata }) },
  } }
  const sql = tag(db)
  sql.begin = callback => db.transaction(tx => callback(tag(tx)))
  return { db, sql, clerk, created, mirrored }
}

test('identity migration is dry-run by default, preserves roles, reuses users and is idempotent', async () => {
  const { db, sql, clerk, created, mirrored } = await setup()
  try {
    const dry = await migrateIdentities(sql, clerk)
    assert.deepEqual(dry.migrated.map(item => item.action), ['would-create', 'would-create', 'would-reuse'])
    assert.equal((await db.query('SELECT count(*)::int AS count FROM soundstage.profiles')).rows[0].count, 0)
    assert.equal(created.length, 0)

    const result = await migrateIdentities(sql, clerk, { execute: true })
    assert.equal(result.failed.length, 0)
    assert.deepEqual(result.migrated.map(item => item.role).sort(), ['admin', 'client', 'provider'])
    assert.equal(created.length, 2)
    assert.equal(created.every(item => item.skipPasswordRequirement === true), true)
    assert.deepEqual(created.find(item => item.emailAddress[0] === 'client@example.com'), {
      emailAddress: ['client@example.com'], skipPasswordRequirement: true, firstName: 'Client', lastName: 'Person', publicMetadata: { role: 'client' },
    })
    assert.deepEqual(mirrored, [{ id: 'user_provider', metadata: { publicMetadata: { role: 'provider' } } }])
    const profiles = (await db.query('SELECT email,role FROM soundstage.profiles ORDER BY email')).rows
    assert.deepEqual(profiles.map(item => item.role), ['admin', 'client', 'provider'])

    const rerun = await migrateIdentities(sql, clerk, { execute: true })
    assert.equal(rerun.migrated.length, 0)
    assert.equal(rerun.skipped.length, 3)
    assert.equal(created.length, 2)
  } finally { await db.close() }
})

test('a Clerk rejection is reported while later identities still migrate', async () => {
  const { db, sql, clerk } = await setup()
  try {
    const original = clerk.users.createUser
    clerk.users.createUser = async input => {
      if (input.emailAddress[0] === 'admin@example.com') throw Object.assign(new Error('address rejected'), { code: 'form_identifier_not_allowed' })
      return original(input)
    }
    const result = await migrateIdentities(sql, clerk, { execute: true })
    assert.deepEqual(result.failed.map(item => item.email), ['admin@example.com'])
    assert.deepEqual(result.migrated.map(item => item.email), ['client@example.com', 'provider@example.com'])
    assert.equal((await db.query("SELECT count(*)::int AS count FROM soundstage.profiles WHERE email='admin@example.com'")).rows[0].count, 0)
  } finally { await db.close() }
})

test('a post-Clerk database conflict reports a recoverable ID and can retry without changing sources', async () => {
  const { db, sql, clerk } = await setup()
  try {
    await db.query('INSERT INTO soundstage.profiles(clerk_user_id,email,role) VALUES ($1,$2,$3)', ['user_admin', 'occupied@example.com', 'client'])
    const before = (await db.query('SELECT auth_id,email,role FROM soundstage.identities ORDER BY email')).rows
    const first = await migrateIdentities(sql, clerk, { execute: true })
    assert.deepEqual(first.failed.map(item => ({ email: item.email, id: item.clerkUserId, action: item.action })), [{ email: 'admin@example.com', id: 'user_admin', action: 'created' }])
    assert.deepEqual(first.migrated.map(item => item.email), ['client@example.com', 'provider@example.com'])
    assert.deepEqual((await db.query('SELECT auth_id,email,role FROM soundstage.identities ORDER BY email')).rows, before)

    await db.query("DELETE FROM soundstage.profiles WHERE email='occupied@example.com'")
    const retry = await migrateIdentities(sql, clerk, { execute: true })
    assert.deepEqual(retry.failed, [])
    assert.deepEqual(retry.migrated.map(item => ({ email: item.email, id: item.clerkUserId, action: item.action })), [{ email: 'admin@example.com', id: 'user_admin', action: 'reused' }])
    assert.equal(retry.skipped.length, 2)
    assert.deepEqual((await db.query('SELECT auth_id,email,role FROM soundstage.identities ORDER BY email')).rows, before)
  } finally { await db.close() }
})
