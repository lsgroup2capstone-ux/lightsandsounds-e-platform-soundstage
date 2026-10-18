const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { setRole } = require('../../scripts/auth/role-set.cjs')

function tag(connection) {
  return async (parts, ...values) => (await connection.query(parts.reduce((sql, part, index) => sql + (index ? '$' + index : '') + part, ''), values)).rows
}

async function setup() {
  const db = new PGlite({ extensions: { btree_gist: require('@electric-sql/pglite/contrib/btree_gist').btree_gist } })
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('database/schema.sql', 'utf8'))
  await db.query('INSERT INTO soundstage.users(clerk_user_id,email,role) VALUES ($1,$2,$3)', ['user_role_set', 'operator@example.com', 'client'])
  const sql = { begin: callback => db.transaction(transaction => callback(tag(transaction))) }
  return { db, sql }
}

test('role:set updates the profile and Clerk mirror and returns old/new roles', async () => {
  const { db, sql } = await setup()
  const calls = []
  try {
    const result = await setRole(sql, { users: { updateUserMetadata: async (...args) => { calls.push(args) } } }, ' Operator@Example.com ', 'payroll_master')
    assert.deepEqual(result, { oldRole: 'client', newRole: 'payroll_master' })
    assert.equal((await db.query("SELECT role FROM soundstage.users WHERE email='operator@example.com'")).rows[0].role, 'payroll_master')
    assert.deepEqual(calls, [['user_role_set', { publicMetadata: { role: 'payroll_master' } }]])
  } finally { await db.close() }
})

test('role:set rejects invalid and unknown inputs without changing a profile', async () => {
  const { db, sql } = await setup()
  const clerk = { users: { updateUserMetadata: async () => { throw new Error('must not be called') } } }
  try {
    await assert.rejects(setRole(sql, clerk, 'not-an-email', 'admin'), /Usage/)
    await assert.rejects(setRole(sql, clerk, 'operator@example.com', 'owner'), /Usage/)
    await assert.rejects(setRole(sql, clerk, 'missing@example.com', 'admin'), /No signed-in user/)
    assert.equal((await db.query("SELECT role FROM soundstage.users WHERE email='operator@example.com'")).rows[0].role, 'client')
  } finally { await db.close() }
})

test('role:set rolls back the database change when the Clerk mirror fails', async () => {
  const { db, sql } = await setup()
  try {
    const clerk = { users: { updateUserMetadata: async () => { throw new Error('Clerk unavailable') } } }
    await assert.rejects(setRole(sql, clerk, 'operator@example.com', 'admin'), /Clerk unavailable/)
    assert.equal((await db.query("SELECT role FROM soundstage.users WHERE email='operator@example.com'")).rows[0].role, 'client')
  } finally { await db.close() }
})
