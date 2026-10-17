import "server-only"
import { createClerkClient } from "@clerk/backend"
import type postgres from "postgres"
import type { AppIdentity } from "./clerk-auth"
import { ROLES, type Role } from "./access-rules"
import { RequestError } from "../request-error"

type ProfileSql = postgres.Sql | postgres.TransactionSql
type ProfileRow = {
  clerk_user_id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  role: Role
  status: Profile["status"]
}
export type Profile = {
  clerkUserId: string
  email: string
  firstName: string
  lastName: string
  phone: string
  role: Role
  status: "active" | "suspended" | "deactivated"
}

function fromRow(row: ProfileRow): Profile {
  return {
    clerkUserId: row.clerk_user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    role: row.role,
    status: row.status,
  }
}

export async function findProfileByClerkId(sql: ProfileSql, clerkUserId: string): Promise<Profile | null> {
  const rows = await sql<ProfileRow[]>`select clerk_user_id,email,first_name,last_name,phone,role,status from soundstage.profiles where clerk_user_id=${clerkUserId}`
  return rows[0] ? fromRow(rows[0]) : null
}

export async function mirrorRole(clerkUserId: string, role: Role) {
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
    await clerk.users.updateUserMetadata(clerkUserId, { publicMetadata: { role } })
    return true
  } catch {
    console.warn("role-mirror-failed")
    return false
  }
}

export async function ensureProfile(tx: postgres.TransactionSql, identity: AppIdentity, signupRole?: string): Promise<Profile> {
  const existing = await findProfileByClerkId(tx, identity.id)
  if (existing) return existing

  const email = identity.email?.trim().toLowerCase()
  if (!email) throw new RequestError("A verified email is required.", 401)
  const legacyIdentities = await tx<{ role: string }[]>`select role from soundstage.clerk_identities where clerk_id=${identity.id}`
  const records = await tx<{ value: unknown }[]>`select value from soundstage.records where key='soundstage-accounts-v2'`
  const accounts = Array.isArray(records[0]?.value) ? records[0].value as { email?: unknown; role?: unknown }[] : []
  const importedRole = accounts.find(account => String(account.email || "").toLowerCase() === email && ["client", "provider"].includes(String(account.role)))?.role
  const legacyRole = legacyIdentities[0]?.role
  const role: Role = legacyRole === "provider" || legacyRole === "client"
    ? legacyRole
    : importedRole === "provider" || importedRole === "client"
      ? importedRole
      : signupRole === "provider" ? "provider" : "client"
  const metadata = identity.user_metadata || {}
  const insertedRows = await tx`insert into soundstage.profiles
    (clerk_user_id,email,first_name,last_name,phone,role)
    values (${identity.id},${email},${String(metadata.firstName || metadata.given_name || "New").slice(0, 100)},${String(metadata.lastName || metadata.family_name || "User").slice(0, 100)},${String(metadata.mobile || "").slice(0, 32)},${role})
    on conflict do nothing returning clerk_user_id`
  const profile = await findProfileByClerkId(tx, identity.id)
  if (!profile) throw new RequestError("This email is linked to another account. Contact support.", 409)
  if (insertedRows.length) await mirrorRole(identity.id, profile.role)
  return profile
}
