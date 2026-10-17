require('@next/env').loadEnvConfig(process.cwd())
const { createClient } = require('@supabase/supabase-js')

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!email || !email.includes('@') || !password || password.length < 8) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters) in .env.local.')
  }
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and server-only SUPABASE_SECRET_KEY in .env.local.')
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' },
    user_metadata: { firstName: 'SoundStage', lastName: 'Admin' },
  })
  if (error) throw error
  if (!data.user || data.user.app_metadata.role !== 'admin') throw new Error('Administrator creation could not be verified.')
  console.log(`Administrator created: ${email}. Sign in using ADMIN_PASSWORD from .env.local.`)
}

main().catch(error => {
  console.error('Administrator creation failed:', error.message)
  process.exitCode = 1
})
