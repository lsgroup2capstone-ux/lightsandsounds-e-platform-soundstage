import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server"
const clerk = clerkMiddleware()
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return NextResponse.next()
  return clerk(request, event)
}
// API routes verify explicit bearer tokens for the selected authentication provider.
export const config = { matcher: ["/((?!api/|_next/|.*\\..*).*)"] }
