const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')

test('users table is constrained, repeatable and private (data dictionary Table 3)', async () => {
  const db = new PGlite({ extensions: { btree_gist: require('@electric-sql/pglite/contrib/btree_gist').btree_gist } })
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
    const schema = readFileSync('database/schema.sql', 'utf8')
    await db.exec(schema)
    await db.query("INSERT INTO soundstage.users(clerk_user_id,email,first_name,last_name,role) VALUES ('user_one','one@example.com','One','User','client')")
    await db.exec(schema)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM soundstage.users')).rows[0].count, 1)
    const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='soundstage' AND table_name='users' ORDER BY ordinal_position")).rows.map(row => row.column_name)
    assert.deepEqual(columns.slice(0, 10), ['user_id', 'clerk_user_id', 'first_name', 'middle_name', 'last_name', 'email', 'username', 'phone_number', 'role', 'status'])
    assert.equal(columns.includes('password'), false)
    const [row] = (await db.query("SELECT user_id, status, date_created FROM soundstage.users WHERE email = 'one@example.com'")).rows
    assert.equal(row.user_id, 1)
    assert.equal(row.status, 'active')
    assert.ok(row.date_created instanceof Date)

    await assert.rejects(db.query("INSERT INTO soundstage.users(clerk_user_id,email,role) VALUES ('bad-id','lower@example.com','client')"), /check constraint/)
    await assert.rejects(db.query("INSERT INTO soundstage.users(email,role) VALUES ('Upper@example.com','client')"), /check constraint/)
    await assert.rejects(db.query("INSERT INTO soundstage.users(email,role) VALUES ('role@example.com','owner')"), /check constraint/)
    await assert.rejects(db.query("INSERT INTO soundstage.users(email,role) VALUES ('one@example.com','client')"), /duplicate key/)
    await assert.rejects(db.query("INSERT INTO soundstage.users(email,role,verification_status) VALUES ('c@example.com','client','approved')"), /check constraint/)
    await assert.rejects(db.query("UPDATE soundstage.users SET status='deleted'"), /check constraint/)

    for (const role of ['anon', 'authenticated']) {
      await db.exec('SET ROLE ' + role)
      await assert.rejects(db.query('SELECT * FROM soundstage.users'), /permission denied/)
      await db.exec('RESET ROLE')
    }
  } finally { await db.close() }
})
