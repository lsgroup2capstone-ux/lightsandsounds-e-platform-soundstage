import "server-only"
import { createClerkClient } from "@clerk/backend"
import type postgres from "postgres"
import type { AppIdentity } from "./clerk-auth"
import type { Role } from "./access-rules"
import { RequestError } from "../request-error"

type ProfileSql = postgres.Sql | postgres.TransactionSql
type ProfileRow = {
  user_id: string
  clerk_user_id: string | null
  email: string
  first_name: string
  last_name: string
  phone_number: string | null
  role: Role
  status: Profile["status"]
}
// A signed-in person, read from soundstage.users (data dictionary Table 3).
export type Profile = {
  userId: number
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
    userId: Number(row.user_id),
    clerkUserId: row.clerk_user_id || "",
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone_number || "",
    role: row.role,
    status: row.status,
  }
}

export async function findProfileByClerkId(sql: ProfileSql, clerkUserId: string): Promise<Profile | null> {
  const rows = await sql<ProfileRow[]>`select user_id,clerk_user_id,email,first_name,last_name,phone_number,role,status from soundstage.users where clerk_user_id=${clerkUserId}`
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

// First Clerk sign-in links an existing user by email, or creates a client/provider user.
export async function ensureProfile(tx: postgres.TransactionSql, identity: AppIdentity, signupRole?: string): Promise<Profile> {
  const existing = await findProfileByClerkId(tx, identity.id)
  if (existing) return existing

  const email = identity.email?.trim().toLowerCase()
  if (!email) throw new RequestError("A verified email is required.", 401)
  const linked = await tx`update soundstage.users set clerk_user_id = ${identity.id}, updated_at = now() where email = ${email} and clerk_user_id is null returning user_id`
  let inserted: readonly unknown[] = []
  if (!linked.length) {
    const metadata = identity.user_metadata || {}
    const role: Role = signupRole === "provider" ? "provider" : "client"
    inserted = await tx`insert into soundstage.users (clerk_user_id, email, first_name, last_name, phone_number, role, verification_status)
      values (${identity.id}, ${email}, ${String(metadata.firstName || metadata.given_name || "New").slice(0, 100)}, ${String(metadata.lastName || metadata.family_name || "User").slice(0, 100)},
        ${String(metadata.mobile || "").slice(0, 20) || null}, ${role}, null)
      on conflict do nothing returning user_id`
  }
  const profile = await findProfileByClerkId(tx, identity.id)
  if (!profile) throw new RequestError("This email is linked to another account. Contact support.", 409)
  if (inserted.length || linked.length) await mirrorRole(identity.id, profile.role)
  return profile
}
