require('@next/env').loadEnvConfig(process.cwd())

const demo = process.env.ENABLE_DEMO_OTP === 'true' && process.env.NODE_ENV !== 'production'
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_DB_URL', ...(demo ? [] : ['PHILSMS_API_TOKEN', 'PHILSMS_SENDER_ID'])]
let invalid = false
for (const name of required) {
  const value = process.env[name]?.trim()
  const configured = Boolean(value && !/your[_-]|replace[_-]?me|example|placeholder/i.test(value))
  console.log(`${name}: ${configured ? 'set' : 'missing or placeholder'}`)
  if (!configured) invalid = true
}
console.log(demo ? 'Local demo OTP enabled: 123456. No SMS is sent; PhilSMS credentials are not required.' : 'Signup OTP uses PhilSMS directly. No Supabase SMS provider or hook is required. Run npm run db:init once for OTP storage.')
console.log('See docs/philsms-setup.md. No SMS was sent and no credentials were printed.')
process.exitCode = invalid ? 1 : 0
