const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

test('backup round trip is admin-only, verified, atomic and preserves sign-in identities', async () => {
  process.env.BACKUP_SIGNING_SECRET = 'test-only-backup-signing-key'
  const db = new PGlite()
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
  const read = async () => (await db.query('SELECT key,value FROM soundstage.records ORDER BY key')).rows
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
    await db.exec(readFileSync('database/schema.sql', 'utf8'))
    for (const u of [admin, client]) await db.query('INSERT INTO auth.users(id) VALUES ($1)', [u.id])
    await execute(admin); await execute(client)
    await db.query('INSERT INTO soundstage.records(key,value) VALUES ($1,$2)', ['soundstage-booking-messages-v1', [{ id: 'message-1', body: 'Original' }]])
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
    tampered.records['soundstage-booking-messages-v1'] = '[]'
    await assert.rejects(execute(admin, 'restoreBackup', [tampered, 'RESTORE']), /verification failed/)
    await assert.rejects(execute(admin, 'restoreBackup', [{ ...backup, version: 2 }, 'RESTORE']), /Unsupported/)
    await assert.rejects(execute(admin, 'restoreBackup', [{ ...backup, signature: '' }, 'RESTORE']), /signature/)
    assert.deepEqual(await read(), before)
    await db.query('UPDATE soundstage.records SET value=$1 WHERE key=$2', [[{ id: 'message-1', body: 'Changed' }], 'soundstage-booking-messages-v1'])
    await db.query('INSERT INTO soundstage.records(key,value) VALUES ($1,$2)', ['soundstage-schedule:later', ['2027-01-01']])
    const identities = (await db.query('SELECT * FROM soundstage.identities ORDER BY email')).rows
    // Force a persistence failure after the action mutates memory; the entire transaction must roll back.
    await db.exec("ALTER TABLE soundstage.records ADD CONSTRAINT reject_original CHECK (key <> 'soundstage-booking-messages-v1' OR value::text NOT LIKE '%Original%')")
    const changed = await read()
    await assert.rejects(execute(admin, 'restoreBackup', [backup, 'RESTORE']), /check constraint/)
    assert.deepEqual(await read(), changed)
    await db.exec('ALTER TABLE soundstage.records DROP CONSTRAINT reject_original')
    const restored = await execute(admin, 'restoreBackup', [backup, 'RESTORE'])
    assert.equal(JSON.parse(restored.records['soundstage-booking-messages-v1'])[0].body, 'Original')
    assert.equal(restored.records['soundstage-schedule:later'], undefined)
    assert.ok(JSON.parse(restored.records['soundstage-accounts-v2']).some(a => a.email === admin.email && a.role === 'admin'))
    assert.equal(JSON.parse(restored.records['soundstage-marketplace-v1']).audit[0].action, 'App backup restored')
    assert.deepEqual((await db.query('SELECT * FROM soundstage.identities ORDER BY email')).rows, identities)
    assert.equal(JSON.parse((await execute(client)).session['soundstage-session']).email, client.email)
  } finally { await db.close(); delete process.env.BACKUP_SIGNING_SECRET }
})
