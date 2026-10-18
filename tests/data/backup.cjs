const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')
const tables = require('../helpers/record-tables.cjs')

test('backup round trip is admin-only, verified, atomic and preserves sign-in identities', async () => {
  process.env.BACKUP_SIGNING_SECRET = 'test-only-backup-signing-key'
  const db = new PGlite({ extensions: { btree_gist: require('@electric-sql/pglite/contrib/btree_gist').btree_gist } })
  const tag = connection => {
    const query = async (parts, ...values) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), values)).rows
    query.json = value => JSON.stringify(value)
    return query
  }
  const sql = { begin: callback => db.transaction(tx => callback(tag(tx))) }
  const load = require('../helpers/ts-loader.cjs')({ [path.resolve('lib/server/db/database.ts')]: { getDatabase: () => sql } })
  const { execute } = load('lib/server/data-service.ts')
  const admin = { id: '00000000-0000-0000-0000-000000000001', email: 'admin@test.com', user_metadata: {}, app_metadata: { role: 'admin' } }
  const client = { ...admin, id: '00000000-0000-0000-0000-000000000002', email: 'client@test.com', app_metadata: {} }
  const read = () => tables.readRecords(db)
  const readsKey = 'soundstage-event-notifications:admin:admin@test.com'
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
    await db.exec(readFileSync('database/schema.sql', 'utf8'))
    for (const u of [admin, client]) await db.query('INSERT INTO auth.users(id) VALUES ($1)', [u.id])
    await execute(admin); await execute(client)
    // The interim bell's read state is stored as read notifications of the admin.
    await db.query("INSERT INTO soundstage.notifications(user_id,type,title,is_read) SELECT user_id,'read_receipt','n-original',true FROM soundstage.users WHERE email='admin@test.com'")
    const backup = (await execute(admin, 'createBackup')).result
    assert.equal(backup.format, 'soundstage-backup')
    assert.equal(backup.records['soundstage-admin-account'], undefined)
    assert.equal(JSON.parse(backup.records['soundstage-accounts-v2']).some(a => a.role === 'admin'), false)
    for (const action of ['createBackup', 'previewBackup', 'restoreBackup']) {
      await assert.rejects(execute(null, action, [backup, 'RESTORE']), /Sign in/)
      await assert.rejects(execute(client, action, [backup, 'RESTORE']), /Administrator/)
    }
    assert.equal((await execute(admin, 'previewBackup', [backup])).result.accounts, 1)
    const before = await read()
    await assert.rejects(execute(admin, 'restoreBackup', [backup, 'yes']), /Type RESTORE/)
    const tampered = structuredClone(backup)
    tampered.records[readsKey] = '[]'
    await assert.rejects(execute(admin, 'restoreBackup', [tampered, 'RESTORE']), /verification failed/)
    await assert.rejects(execute(admin, 'restoreBackup', [{ ...backup, version: 2 }, 'RESTORE']), /Unsupported/)
    await assert.rejects(execute(admin, 'restoreBackup', [{ ...backup, signature: '' }, 'RESTORE']), /signature/)
    assert.deepEqual(await read(), before)
    await db.query("UPDATE soundstage.notifications SET title='n-changed' WHERE type='read_receipt'")
    await db.query("INSERT INTO soundstage.users(email,role,verification_status) VALUES ('later@test.com','provider','approved')")
    await db.query("INSERT INTO soundstage.schedules(provider_id,available_date,is_available) SELECT user_id,'2027-01-01',false FROM soundstage.users WHERE email='later@test.com'")
    const identities = (await db.query('SELECT email, role, clerk_user_id FROM soundstage.users ORDER BY email')).rows
    // Force a persistence failure after the action mutates memory; the entire transaction must roll back.
    await db.exec("ALTER TABLE soundstage.notifications ADD CONSTRAINT reject_original CHECK (title <> 'n-original')")
    const changed = await read()
    await assert.rejects(execute(admin, 'restoreBackup', [backup, 'RESTORE']), /check constraint/)
    assert.deepEqual(await read(), changed)
    await db.exec('ALTER TABLE soundstage.notifications DROP CONSTRAINT reject_original')
    const restored = await execute(admin, 'restoreBackup', [backup, 'RESTORE'])
    assert.deepEqual(JSON.parse(restored.records[readsKey]), ['n-original'])
    assert.equal(restored.records['soundstage-schedule:later%40test.com'], undefined)
    assert.ok(JSON.parse(restored.records['soundstage-accounts-v2']).some(a => a.email === admin.email && a.role === 'admin'))
    assert.equal(JSON.parse(restored.records['soundstage-marketplace-v1']).audit[0].action, 'App backup restored')
    // Restore never deletes users; sign-in links and roles are unchanged.
    assert.deepEqual((await db.query('SELECT email, role, clerk_user_id FROM soundstage.users ORDER BY email')).rows, identities)
    assert.equal(JSON.parse((await execute(client)).session['soundstage-session']).email, client.email)
  } finally { await db.close(); delete process.env.BACKUP_SIGNING_SECRET }
})
