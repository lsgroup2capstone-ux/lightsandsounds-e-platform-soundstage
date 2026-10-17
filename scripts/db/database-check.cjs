require('@next/env').loadEnvConfig(process.cwd())
const postgres = require('postgres')
const { databaseConfig } = require('./database-config.cjs')
;(async () => {
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const versions = await sql.unsafe('SELECT version, applied_at FROM soundstage.schema_versions ORDER BY version')
    const counts = await sql.unsafe('SELECT (SELECT count(*) FROM soundstage.records) AS collections, (SELECT count(*) FROM soundstage.identities) AS accounts, (SELECT count(*) FROM soundstage.clerk_identities) AS clerk_accounts')
    const clerkSecurity = await sql.unsafe("SELECT relrowsecurity AS rls_enabled, has_table_privilege('anon', oid, 'SELECT') AS anon_can_read, has_table_privilege('authenticated', oid, 'SELECT') AS authenticated_can_read FROM pg_class WHERE oid = 'soundstage.clerk_identities'::regclass")
    console.log(JSON.stringify({ versions, counts, clerkSecurity }, null, 2))
  } finally { await sql.end() }
})().catch(error => { console.error('Database check failed:', error.code === 'DATABASE_NOT_CONFIGURED' ? error.message : error.code || error.message); process.exitCode = 1 })
