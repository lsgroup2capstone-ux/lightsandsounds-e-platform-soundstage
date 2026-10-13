import "server-only"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getDatabase } from "./database"
import { findProfileByClerkId, mirrorRole, type Profile } from "./profiles"
import {
  ROLES,
  areaFor,
  canAccessPath,
  dashboardFor,
  isRole,
  resolveAccess,
  safeReturnTo,
  type Role,
} from "./access-rules"

export { ROLES, areaFor, canAccessPath, dashboardFor, isRole, resolveAccess, safeReturnTo }
export type { Role } from "./access-rules"

export type CurrentProfile = {
  session: { userId: string; sessionId: string; claimRole: Role | null }
  profile: Profile | null
  error: boolean
}

export type RequireRoleResult =
  | { kind: "allow" }
  | { kind: "refresh"; to: string }
  | { kind: "error" }
  | { kind: "unavailable" }

function hasClerkKeys() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
}

function claimRoleFrom(value: unknown): Role | null {
  if (!value || typeof value !== "object") return null
  const role = (value as Record<string, unknown>).role
  return isRole(role) ? role : null
}

export async function getCurrentProfile(area: Role | "router" = "router"): Promise<CurrentProfile | null> {
  const { userId, sessionId, sessionClaims } = await auth()
  if (!userId || !sessionId) return null
  const session = { userId, sessionId, claimRole: claimRoleFrom(sessionClaims) }
  try {
    const profile = await findProfileByClerkId(getDatabase(), userId)
    return { session, profile, error: false }
  } catch {
    logDecision(area, "profile-lookup-failed")
    return { session, profile: null, error: true }
  }
}

export function hasRole(profile: Profile | null | undefined, ...roles: Role[]) {
  return Boolean(profile && roles.includes(profile.role))
}

async function revokeSession(sessionId: string) {
  try {
    const clerk = await clerkClient()
    await clerk.sessions.revokeSession(sessionId)
    return true
  } catch {
    return false
  }
}

function logDecision(area: Role | "router", kind: string) {
  console.warn(`access-denied ${area} ${kind}`)
}

export async function requireRole(area: Role): Promise<RequireRoleResult> {
  if (!hasClerkKeys()) {
    logDecision(area, "unavailable")
    return { kind: "unavailable" }
  }

  const requestHeaders = await headers()
  const currentPath = safeReturnTo(requestHeaders.get("x-pathname")) ?? dashboardFor(area)
  const current = await getCurrentProfile(area)
  if (!current) {
    logDecision(area, "signed-out")
    redirect(`/login?returnTo=${encodeURIComponent(currentPath)}`)
  }

  const decision = resolveAccess({
    area,
    profile: current.profile,
    profileError: current.error,
    claimRole: current.session.claimRole,
  })
  if (decision.kind === "allow") return decision

  if (decision.kind === "redirect" && current.session.claimRole && current.profile && current.session.claimRole !== current.profile.role) {
    if (!await mirrorRole(current.session.userId, current.profile.role)) {
      logDecision(area, "role-mirror-failed")
      return { kind: "error" }
    }
    logDecision(area, "refresh")
    return { kind: "refresh", to: dashboardFor(current.profile.role) }
  }

  if (decision.kind === "redirect") redirect(decision.to)
  if (decision.kind === "complete") redirect(`/auth/clerk/complete?returnTo=${encodeURIComponent(currentPath)}`)
  if (decision.kind === "signout") {
    if (!await revokeSession(current.session.sessionId)) {
      logDecision(area, "revoke-failed")
      return { kind: "error" }
    }
    logDecision(area, decision.kind)
    redirect(`/login?status=${decision.status}`)
  }
  if (decision.kind === "refresh") {
    if (!await mirrorRole(current.session.userId, current.profile!.role)) {
      logDecision(area, "role-mirror-failed")
      return { kind: "error" }
    }
    logDecision(area, decision.kind)
    return decision
  }
  logDecision(area, decision.kind)
  return decision
}

export function routeDashboard(
  profile: Profile | null,
  { signedIn, returnTo, tab }: { signedIn: boolean; returnTo?: unknown; tab?: unknown },
) {
  if (!signedIn) return "/login"
  if (!profile) return "/auth/clerk/complete"
  if (profile.status !== "active") return `/login?status=${profile.status}`

  const requestedPath = safeReturnTo(returnTo)
  if (requestedPath && canAccessPath(profile.role, requestedPath)) return requestedPath

  const dashboard = dashboardFor(profile.role)
  return profile.role === "client" && typeof tab === "string" && tab
    ? `${dashboard}?tab=${encodeURIComponent(tab)}`
    : dashboard
}

export async function revokeInactiveSession(sessionId: string, status: Profile["status"]) {
  if (status === "active") return true
  const revoked = await revokeSession(sessionId)
  logDecision("router", revoked ? "signout" : "revoke-failed")
  return revoked
}
