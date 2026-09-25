require('@next/env').loadEnvConfig(process.cwd())
const postgres = require('postgres')
const { databaseConfig } = require('./database-config.cjs')
async function main() {
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const counts = await sql`select role, count(*)::int as count from soundstage.clerk_identities group by role`
    const profiles = await sql`select jsonb_array_length(value) as count from soundstage.records where key='soundstage-accounts-v2'`
    const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } })
    if (!response.ok) throw new Error('Auth settings request failed')
    const settings = await response.json()
    console.log(JSON.stringify({ counts, profiles, settings, adminKeyConfigured: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) }, null, 2))
  } finally { await sql.end() }
}
main().catch(error => { console.error('Inventory failed:', error.code || error.message); process.exitCode = 1 })
