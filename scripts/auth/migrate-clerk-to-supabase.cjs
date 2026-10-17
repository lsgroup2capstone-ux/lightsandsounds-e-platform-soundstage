// Defaults to a read-only preflight. --execute creates Auth users and links profiles.
require('@next/env').loadEnvConfig(process.cwd())
const postgres = require('postgres')
const { createClient } = require('@supabase/supabase-js')
const { createClerkClient } = require('@clerk/backend')
const { databaseConfig } = require('../db/database-config.cjs')

function validateSource(mapping, user, profile, existing, identity) {
  const email = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId && e.verification?.status === 'verified')
  if (user.id !== mapping.clerk_id || user.banned || user.locked || email?.emailAddress.toLowerCase() !== mapping.email) throw new Error('Clerk identity is inactive, unverified, or changed; migration stopped.')
  if (!['client', 'provider'].includes(mapping.role) || !profile || profile.role !== mapping.role) throw new Error('Profile role mismatch; migration stopped.')
  if (existing && (!existing.email_confirmed_at || existing.app_metadata.role === 'admin' || (existing.app_metadata.role && existing.app_metadata.role !== mapping.role))) throw new Error('Existing Auth account needs review; migration stopped.')
  if (identity && (identity.role !== mapping.role || identity.auth_id !== existing?.id)) throw new Error('Existing identity conflicts with migration; stopped.')
}

async function main() {
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key || !process.env.CLERK_SECRET_KEY) throw new Error('Server Supabase and Clerk keys are required.')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
    const mappings = await sql`select clerk_id,email,role from soundstage.clerk_identities order by email`
    const identities = await sql`select auth_id,email,role from soundstage.identities`
    const records = await sql`select value from soundstage.records where key='soundstage-accounts-v2'`
    const profiles = records[0]?.value || []
    const users = []
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
      if (error) throw error
      users.push(...data.users)
      if (data.users.length < 100) break
    }
    const plan = []
    for (const mapping of mappings) {
      const source = await clerk.users.getUser(mapping.clerk_id)
      const profile = profiles.find(p => p.email.toLowerCase() === mapping.email)
      const existing = users.find(u => u.email?.toLowerCase() === mapping.email)
      validateSource(mapping, source, profile, existing, identities.find(i => i.email === mapping.email))
      plan.push({ mapping, profile, existing })
    }
    console.log(JSON.stringify({ accounts: plan.length, create: plan.filter(p => !p.existing).length, roles: plan.map(p => p.mapping.role), execute: process.argv.includes('--execute') }))
    if (!process.argv.includes('--execute')) return
    for (const { mapping, profile, existing } of plan) {
      let user = existing
      if (!user) {
        // Clerk API does not export passwords. Users set one through Forgot password.
        // No invitation or other email is sent by this operation.
        const { data, error } = await supabase.auth.admin.createUser({
          email: mapping.email, email_confirm: true,
          app_metadata: { role: mapping.role, migrated_from: 'clerk', clerk_id: mapping.clerk_id },
          user_metadata: { firstName: profile.firstName, lastName: profile.lastName, mobile: profile.mobile, business: profile.business || '', role: mapping.role },
        })
        if (error) throw error
        user = data.user
      }
      await sql.begin(async tx => {
        await tx`select pg_advisory_xact_lock(74832019)`
        const current = await tx`select auth_id,email,role from soundstage.identities where email=${mapping.email} or auth_id=${user.id}`
        if (current.some(i => i.email !== mapping.email || i.auth_id !== user.id || i.role !== mapping.role)) throw new Error('Identity changed during migration; stopped.')
        if (!current.length) await tx`insert into soundstage.identities(auth_id,email,role) values (${user.id},${mapping.email},${mapping.role})`
      })
      const { data, error } = await supabase.auth.admin.getUserById(user.id)
      if (error || data.user?.email?.toLowerCase() !== mapping.email || !data.user.email_confirmed_at) throw new Error('Auth migration verification failed.')
    }
    const remaining = await sql`select count(*)::int as count from soundstage.clerk_identities c left join soundstage.identities i on i.email=c.email and i.role=c.role left join auth.users u on u.id=i.auth_id and lower(u.email)=c.email where u.id is null`
    if (remaining[0].count) throw new Error('Some account mappings were not migrated.')
    const totals = await sql`select i.role,count(*)::int as count from soundstage.identities i join auth.users u on u.id=i.auth_id group by i.role order by i.role`
    console.log(JSON.stringify({ verified: true, totals, profilesPreserved: true, passwordResetRequiredForNewUsers: plan.filter(p => !p.existing).length }))
  } finally { await sql.end() }
}
module.exports = { validateSource }
if (require.main === module) main().catch(error => { console.error('Migration stopped:', error.code || error.message); process.exitCode = 1 })
