import type { Tx } from "../runtime"
import { RequestError } from "../request-error"

// Every table keys people by users.user_id; the app identifies them by email.
export async function userIdByEmail(tx: Tx, email: string): Promise<number | null> {
  const [row] = await tx<{ user_id: string }[]>`select user_id from soundstage.users where email = ${email.trim().toLowerCase()}`
  return row ? Number(row.user_id) : null
}

export async function requireUserId(tx: Tx, email: string): Promise<number> {
  const id = await userIdByEmail(tx, email)
  if (id === null) throw new RequestError("Account not found.", 404)
  return id
}

// Display names used across screens: providers by business name, everyone else by full name.
export const personName = (u: { first_name?: string | null; last_name?: string | null; email: string }) => `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email
export const businessName = (u: { first_name?: string | null; last_name?: string | null; business_name?: string | null; email: string }) => u.business_name || personName(u)
