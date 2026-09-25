require('@next/env').loadEnvConfig(process.cwd())
const postgres = require('postgres')
const { databaseConfig } = require('./database-config.cjs')
;(async () => {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error('Usage: npm run db:admin -- verified-admin@example.com')
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const users = await sql`update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb where lower(email)=${email} and email_confirmed_at is not null returning id`
    if (!users.length) throw new Error('Register and verify this email in Supabase Auth first.')
    console.log('Administrator role assigned. Sign out and sign in again.')
  } finally { await sql.end() }
})().catch(error => { console.error('Administrator setup failed:', error.code === 'DATABASE_NOT_CONFIGURED' ? error.message : error.code || error.message); process.exitCode = 1 })
