import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server"
import { ROLES, areaFor, canAccessPath, dashboardFor, type Role } from "@/lib/server/access-rules"

const unavailable = () => new NextResponse(
  '<p role="alert">Sign-in is temporarily unavailable. Please try again later.</p>',
  { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
)

const clerk = clerkMiddleware(async (auth, request) => {
  const area = areaFor(request.nextUrl.pathname)
  if (area === null) return NextResponse.next()

  const { userId, sessionClaims } = await auth()
  if (!userId) {
    if (area === "router") return NextResponse.redirect(new URL("/login", request.url))
    const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
    return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, request.url))
  }

  const value = sessionClaims && typeof sessionClaims === "object"
    ? (sessionClaims as Record<string, unknown>).role
    : null
  const claimRole = ROLES.includes(value as Role) ? value as Role : null
  if (claimRole && area !== "router" && !canAccessPath(claimRole, request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL(dashboardFor(claimRole), request.url))
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return NextResponse.next({ request: { headers: requestHeaders } })
})

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return areaFor(request.nextUrl.pathname) === null ? NextResponse.next() : unavailable()
  }
  return clerk(request, event)
}
// API routes verify explicit bearer tokens for the selected authentication provider.
export const config = { matcher: ["/((?!api/|_next/|.*\\..*).*)"] }
