// Dry-run by default. Pass --execute only after reviewing the planned actions.
require('@next/env').loadEnvConfig(process.cwd())

const ACCOUNT_KEY = 'soundstage-accounts-v2'

function listData(response) {
  return Array.isArray(response) ? response : response?.data || []
}

function verifiedPrimary(user, email) {
  const primary = user?.emailAddresses?.find(item => item.id === user.primaryEmailAddressId)
  return primary?.verification?.status === 'verified' && primary.emailAddress?.toLowerCase() === email
}

function safeReason(error) {
  const value = String(error?.code || error?.message || 'migration-error').replace(/[\r\n]+/g, ' ').slice(0, 160)
  return value.replace(/(bearer|token|secret|password)\s*[:=]?\s*\S+/gi, '$1 [redacted]')
}

async function migrateIdentities(sql, clerk, { execute = false } = {}) {
  const rows = await sql`
    select i.email, i.role, p.clerk_user_id as profile_clerk_user_id
    from soundstage.identities i
    left join soundstage.profiles p on p.email = i.email
    order by i.email
  `
  const accountRows = await sql`select value from soundstage.records where key=${ACCOUNT_KEY}`
  const accounts = Array.isArray(accountRows[0]?.value) ? accountRows[0].value : []
  const result = { migrated: [], skipped: [], failed: [] }

  for (const row of rows) {
    const email = row.email.toLowerCase()
    if (row.profile_clerk_user_id) {
      result.skipped.push({ email, role: row.role, reason: 'already-migrated' })
      continue
    }
    let clerkUser = null
    let action = 'lookup'
    try {
      const matches = listData(await clerk.users.getUserList({ emailAddress: [email] }))
      action = 'would-create'
      if (matches.length) {
        if (matches.length !== 1 || !verifiedPrimary(matches[0], email)) throw new Error('Clerk email match is not a single verified primary email.')
        clerkUser = matches[0]
        action = 'would-reuse'
      }
      if (!execute) {
        result.migrated.push({ email, role: row.role, action, ...(clerkUser ? { clerkUserId: clerkUser.id } : {}) })
        continue
      }

      const account = accounts.find(item => String(item?.email || '').toLowerCase() === email) || {}
      const firstName = String(account.firstName || '').slice(0, 100)
      const lastName = String(account.lastName || '').slice(0, 100)
      if (!clerkUser) {
        clerkUser = await clerk.users.createUser({
          emailAddress: [email], skipPasswordRequirement: true, firstName, lastName,
          publicMetadata: { role: row.role },
        })
        action = 'created'
      } else {
        await clerk.users.updateUserMetadata(clerkUser.id, { publicMetadata: { role: row.role } })
        action = 'reused'
      }
      if (!clerkUser?.id) throw new Error('Clerk did not return a user ID.')

      await sql.begin(async tx => {
        await tx`select pg_advisory_xact_lock(74832021)`
        await tx`
          insert into soundstage.profiles (clerk_user_id,email,first_name,last_name,role)
          values (${clerkUser.id},${email},${firstName},${lastName},${row.role})
          on conflict do nothing
        `
        const saved = await tx`select clerk_user_id,role from soundstage.profiles where email=${email}`
        if (saved.length !== 1 || saved[0].clerk_user_id !== clerkUser.id || saved[0].role !== row.role) {
          throw new Error('Profile conflicts with the migrated Clerk user or role.')
        }
      })
      result.migrated.push({ email, role: row.role, clerkUserId: clerkUser.id, action })
    } catch (error) {
      result.failed.push({ email, role: row.role, action, ...(clerkUser?.id ? { clerkUserId: clerkUser.id } : {}), reason: safeReason(error) })
    }
  }
  return result
}

async function main() {
  const postgres = require('postgres')
  const { createClerkClient } = require('@clerk/backend')
  const { databaseConfig } = require('./database-config.cjs')
  if (!process.env.CLERK_SECRET_KEY) throw new Error('Set CLERK_SECRET_KEY before running the profile migration.')
  const execute = process.argv.includes('--execute')
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const result = await migrateIdentities(sql, createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }), { execute })
    for (const item of result.migrated) console.log(execute ? `profile-migrated ${item.email} ${item.role} ${item.clerkUserId} ${item.action}` : `${item.action} ${item.email} ${item.role}${item.clerkUserId ? ` ${item.clerkUserId}` : ''}`)
    for (const item of result.skipped) console.log(`skipped ${item.email} ${item.reason}`)
    for (const item of result.failed) console.error(`failed ${item.email}${item.clerkUserId ? ` ${item.clerkUserId} ${item.action}` : ''} ${item.reason}`)
    console.log(JSON.stringify({ execute, migrated: result.migrated.length, skipped: result.skipped.length, failed: result.failed.length }))
    if (result.failed.length) process.exitCode = 1
  } finally {
    await sql.end()
  }
}

module.exports = { migrateIdentities }
if (require.main === module) main().catch(error => { console.error('Profile migration stopped:', safeReason(error)); process.exitCode = 1 })
