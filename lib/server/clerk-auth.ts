import "server-only"
import { createClerkClient } from "@clerk/nextjs/server"
import type { User } from "@supabase/supabase-js"

export type AppIdentity = Pick<User, "id" | "email" | "email_confirmed_at" | "app_metadata" | "user_metadata"> & { authSource?: "clerk" }

export async function authenticateClerk(request: Request): Promise<AppIdentity> {
  const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "")).split(",").map(origin => origin.trim()).filter(Boolean)
  if (!authorizedParties.length) throw new Error("Clerk authorized origins are not configured.")
  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY })
  const state = await client.authenticateRequest(request, { authorizedParties, acceptsToken: "session_token" })
  const identity = state.toAuth()
  if (!identity?.userId || !identity.sessionId) throw new Error("Invalid Clerk session.")
  const [user, session] = await Promise.all([client.users.getUser(identity.userId), client.sessions.getSession(identity.sessionId)])
  if (session.status !== "active" || session.userId !== user.id || user.banned || user.locked) throw new Error("Inactive Clerk session.")
  const email = user.emailAddresses.find(item => item.id === user.primaryEmailAddressId && item.verification?.status === "verified")
  if (!email) throw new Error("A verified email is required.")
  const isGoogle = user.externalAccounts.some(account => ["google", "oauth_google"].includes(account.provider) && account.emailAddress.toLowerCase() === email.emailAddress.toLowerCase() && account.verification?.status === "verified")
  return {
    authSource: "clerk", id: user.id, email: email.emailAddress.toLowerCase(), email_confirmed_at: new Date(user.createdAt).toISOString(),
    app_metadata: { provider: isGoogle ? "google" : "email" },
    user_metadata: { firstName: user.firstName || "", lastName: user.lastName || "", mobile: String(user.unsafeMetadata?.mobile || "").slice(0, 32), business: String(user.unsafeMetadata?.business || "").slice(0, 200) },
  }
}
