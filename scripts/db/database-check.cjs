require('@next/env').loadEnvConfig(process.cwd())
const postgres = require('postgres')
const { databaseConfig } = require('./database-config.cjs')
;(async () => {
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    // The 11 core tables (data dictionary Tables 3-13) and their row counts.
    const tables = ['users', 'service_packages', 'bookings', 'schedules', 'payments', 'feedback', 'subscriptions', 'messages', 'refunds', 'notifications', 'audit_log']
    const counts = {}
    for (const table of tables) counts[table] = Number((await sql.unsafe(`SELECT count(*) AS n FROM soundstage.${table}`))[0].n)
    const clerkSecurity = await sql.unsafe("SELECT relrowsecurity AS rls_enabled, has_table_privilege('anon', oid, 'SELECT') AS anon_can_read, has_table_privilege('authenticated', oid, 'SELECT') AS authenticated_can_read FROM pg_class WHERE oid = 'soundstage.users'::regclass")
    console.log(JSON.stringify({ counts, usersSecurity: clerkSecurity }, null, 2))
  } finally { await sql.end() }
})().catch(error => { console.error('Database check failed:', error.code === 'DATABASE_NOT_CONFIGURED' ? error.message : error.code || error.message); process.exitCode = 1 })
