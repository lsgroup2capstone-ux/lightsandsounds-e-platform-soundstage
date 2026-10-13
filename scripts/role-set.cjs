const ROLES = ['client', 'provider', 'payroll_master', 'admin']

async function setRole(sql, clerk, inputEmail, role) {
  const email = String(inputEmail || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ROLES.includes(role)) {
    throw new Error('Usage: npm run role:set -- <email> <client|provider|payroll_master|admin>')
  }
  return sql.begin(async tx => {
    const rows = await tx`select clerk_user_id,role from soundstage.profiles where email=${email} for update`
    if (!rows.length) throw new Error(`No profile for ${email}. The user must sign in once first.`)
    const oldRole = rows[0].role
    await tx`update soundstage.profiles set role=${role},updated_at=now() where clerk_user_id=${rows[0].clerk_user_id}`
    await clerk.users.updateUserMetadata(rows[0].clerk_user_id, { publicMetadata: { role } })
    return { oldRole, newRole: role }
  })
}

async function main() {
  require('@next/env').loadEnvConfig(process.cwd())
  const postgres = require('postgres')
  const { createClerkClient } = require('@clerk/backend')
  const { databaseConfig } = require('./database-config.cjs')
  const email = process.argv[2]
  const role = process.argv[3]
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const result = await setRole(sql, createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }), email, role)
    console.log(`role-set ${String(email).trim().toLowerCase()} ${result.oldRole} -> ${result.newRole}`)
  } finally {
    await sql.end()
  }
}

module.exports = { setRole }
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
