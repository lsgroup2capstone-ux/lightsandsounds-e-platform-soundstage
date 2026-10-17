// Explicit maintenance operation. Defaults to a read-only inventory.
require('@next/env').loadEnvConfig(process.cwd())
const postgres = require('postgres')
const { createClient } = require('@supabase/supabase-js')
const { createClerkClient } = require('@clerk/backend')
const { databaseConfig } = require('./database-config.cjs')

async function main() {
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const identities = await sql`select * from soundstage.identities`
    const clerkIdentities = await sql`select * from soundstage.clerk_identities`
    const users = await sql`select id, lower(email) as email, raw_app_meta_data->>'role' as role from auth.users`
    const records = await sql`select key, value from soundstage.records`
    const admins = users.filter(u => u.role === 'admin' || identities.some(i => i.auth_id === u.id && i.role === 'admin'))
    if (!admins.length) throw new Error('No administrator found; refusing cleanup.')
    const targets = users.filter(u => !admins.some(a => a.id === u.id))
    if (targets.some(u => !identities.some(i => i.auth_id === u.id && ['client', 'provider'].includes(i.role)))) throw new Error('Unclassified Supabase account; review required.')
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
    const clerkUsers = []
    for (let offset = 0; ; offset += 100) {
      const page = await clerk.users.getUserList({ limit: 100, offset })
      clerkUsers.push(...page.data)
      if (clerkUsers.length >= page.totalCount) break
    }
    if (clerkUsers.some(u => !clerkIdentities.some(i => i.clerk_id === u.id) || u.emailAddresses.some(e => admins.some(a => a.email === e.emailAddress.toLowerCase())))) throw new Error('Unclassified or protected Clerk account; review required.')
    const collectionKeys = ['soundstage-booking-messages-v1', 'soundstage-provider-reports-v1', 'soundstage-withdrawals-v1']
    const owned = key => collectionKeys.includes(key) || ['soundstage-provider-services-v2:', 'soundstage-client-bookings-v3:', 'soundstage-schedule:'].some(prefix => key.startsWith(prefix))
    const unknown = records.filter(r => !owned(r.key) && !['soundstage-accounts-v2', 'soundstage-marketplace-v1', 'soundstage-admin-account'].includes(r.key))
    if (unknown.length) throw new Error('Unclassified collections; review required.')
    const storage = await sql`select count(*) from storage.objects where owner_id = any(${targets.map(u => u.id)}::text[])`
    if (Number(storage[0].count)) throw new Error('Owned storage files need cleanup before deleting accounts.')
    console.log(JSON.stringify({ supabaseAccounts: targets.length, clerkAccounts: clerkUsers.length, collections: records.length, administratorsPreserved: admins.length }))
    if (!process.argv.includes('--execute')) return
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    for (const user of clerkUsers) {
      await clerk.users.deleteUser(user.id)
      await sql`delete from soundstage.clerk_identities where clerk_id = ${user.id}`
    }
    for (const user of targets) {
      await sql.begin(async tx => {
        await tx`delete from auth.sessions where user_id = ${user.id}`
        await tx`delete from soundstage.identities where auth_id = ${user.id} and role in ('client', 'provider')`
      })
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) throw new Error('Supabase account deletion failed; cleanup is incomplete.')
    }
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(74832019)`
      for (const record of records) {
        if (owned(record.key)) await tx`delete from soundstage.records where key = ${record.key}`
        if (record.key === 'soundstage-accounts-v2') {
          const kept = record.value.filter(a => a.role === 'admin')
          await tx`update soundstage.records set value = ${tx.json(kept)}, updated_at = now() where key = ${record.key}`
        }
        if (record.key === 'soundstage-marketplace-v1') {
          await tx`update soundstage.records set value = ${tx.json({ subscriptions: [], payments: [], audit: [] })}, updated_at = now() where key = ${record.key}`
        }
      }
    })
    const remaining = await sql`select (select count(*) from auth.users) as auth_users, (select count(*) from soundstage.identities where role <> 'admin') as non_admin_identities, (select count(*) from soundstage.clerk_identities) as clerk_identities`
    const clerkRemaining = await clerk.users.getCount()
    if (Number(remaining[0].auth_users) !== admins.length || Number(remaining[0].non_admin_identities) || Number(remaining[0].clerk_identities) || clerkRemaining) throw new Error('Verification failed; review remaining accounts.')
    console.log(JSON.stringify({ complete: true, remaining: remaining[0], clerkUsers: clerkRemaining }))
  } finally { await sql.end() }
}
main().catch(error => { console.error('Cleanup stopped:', error.code || error.message); process.exitCode = 1 })
