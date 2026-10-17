export const ROLES = ["client", "provider", "payroll_master", "admin"] as const
export type Role = (typeof ROLES)[number]

export type ProtectedArea = Role | "router"
export type AccessProfile = {
  role: Role
  status: "active" | "suspended" | "deactivated"
}
export type AccessDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "refresh"; to: string }
  | { kind: "signout"; status: Exclude<AccessProfile["status"], "active"> }
  | { kind: "complete" }
  | { kind: "error" }

const DASHBOARDS: Record<Role, string> = {
  client: "/client",
  provider: "/provider",
  payroll_master: "/payroll-master",
  admin: "/admin",
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role)
}

export function dashboardFor(role: Role) {
  return DASHBOARDS[role]
}

function matchesSegment(pathname: string, segment: string) {
  return pathname === segment || pathname.startsWith(`${segment}/`)
}

export function areaFor(path: string): ProtectedArea | null {
  const pathname = path.split(/[?#]/, 1)[0]
  if (matchesSegment(pathname, "/client")) return "client"
  if (matchesSegment(pathname, "/provider")) return "provider"
  if (matchesSegment(pathname, "/payroll-master")) return "payroll_master"
  if (matchesSegment(pathname, "/admin")) return "admin"
  if (matchesSegment(pathname, "/dashboard")) return "router"
  return null
}

export function canAccessPath(role: Role, path: string) {
  const area = areaFor(path)
  return area === null || area === role
}

export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return null
  } catch {
    return null
  }
  return value
}

export function resolveAccess({
  area,
  profile,
  profileError = false,
  claimRole,
}: {
  area: Role
  profile: AccessProfile | null
  profileError?: boolean
  claimRole?: Role | null
}): AccessDecision {
  if (profileError) return { kind: "error" }
  if (!profile) return { kind: "complete" }
  if (profile.status !== "active") return { kind: "signout", status: profile.status }
  if (profile.role !== area) return { kind: "redirect", to: dashboardFor(profile.role) }
  if (claimRole && claimRole !== profile.role) return { kind: "refresh", to: dashboardFor(profile.role) }
  return { kind: "allow" }
}
