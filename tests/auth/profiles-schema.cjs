const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')

test('profiles schema is constrained, repeatable, copied from Clerk mappings and private', async () => {
  const db = new PGlite()
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
    const schema = readFileSync('database/schema.sql', 'utf8')
    await db.exec(schema)
    await db.query('INSERT INTO soundstage.clerk_identities(clerk_id,email,role,created_at) VALUES ($1,$2,$3,$4)', ['user_legacy', 'legacy@example.com', 'provider', '2026-01-02T03:04:05Z'])
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', ['10000000-0000-4000-8000-000000000001'])
    await db.query('INSERT INTO soundstage.identities(auth_id,email,role,created_at) VALUES ($1,$2,$3,$4)', ['10000000-0000-4000-8000-000000000001', 'supabase-legacy@example.com', 'client', '2026-02-03T04:05:06Z'])
    const clerkSource = (await db.query('SELECT clerk_id,email,role,created_at::text FROM soundstage.clerk_identities ORDER BY clerk_id')).rows
    const supabaseSource = (await db.query('SELECT auth_id::text,email,role,created_at::text FROM soundstage.identities ORDER BY auth_id')).rows
    await db.exec(schema)

    const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='soundstage' AND table_name='profiles' ORDER BY ordinal_position")).rows.map(row => row.column_name)
    assert.deepEqual(columns, ['clerk_user_id', 'email', 'first_name', 'last_name', 'phone', 'role', 'status', 'created_at', 'updated_at'])
    const copied = (await db.query('SELECT * FROM soundstage.profiles WHERE clerk_user_id=$1', ['user_legacy'])).rows[0]
    assert.equal(copied.email, 'legacy@example.com')
    assert.equal(copied.role, 'provider')
    assert.equal(copied.status, 'active')
    assert.deepEqual((await db.query('SELECT clerk_id,email,role,created_at::text FROM soundstage.clerk_identities ORDER BY clerk_id')).rows, clerkSource)
    assert.deepEqual((await db.query('SELECT auth_id::text,email,role,created_at::text FROM soundstage.identities ORDER BY auth_id')).rows, supabaseSource)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM soundstage.profiles')).rows[0].count, 1)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM soundstage.schema_versions')).rows[0].count, 4)

    await assert.rejects(db.query('INSERT INTO soundstage.profiles(clerk_user_id,email,role) VALUES ($1,$2,$3)', ['bad-id', 'lower@example.com', 'client']), /check constraint/)
    await assert.rejects(db.query('INSERT INTO soundstage.profiles(clerk_user_id,email,role) VALUES ($1,$2,$3)', ['user_upper', 'Upper@example.com', 'client']), /check constraint/)
    await assert.rejects(db.query('INSERT INTO soundstage.profiles(clerk_user_id,email,role) VALUES ($1,$2,$3)', ['user_role', 'role@example.com', 'owner']), /check constraint/)
    await assert.rejects(db.query("UPDATE soundstage.profiles SET status='deleted' WHERE clerk_user_id='user_legacy'"), /check constraint/)

    await db.exec('SET ROLE anon')
    await assert.rejects(db.query('SELECT * FROM soundstage.profiles'), /permission denied/)
    await db.exec('RESET ROLE; SET ROLE authenticated')
    await assert.rejects(db.query('SELECT * FROM soundstage.profiles'), /permission denied/)
    await db.exec('RESET ROLE')
  } finally { await db.close() }
})
