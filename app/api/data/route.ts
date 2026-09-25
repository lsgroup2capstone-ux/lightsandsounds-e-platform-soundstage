import { NextResponse } from "next/server"
import { authenticate, execute, RequestError } from "@/lib/server/data-service"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function handle(request: Request) {
  try {
    const user = await authenticate(request)
    let action: string | undefined
    let args: unknown[] = []
    if (request.method === "POST") {
      const body = await request.text()
      if (body.length > 12000000) throw new RequestError("Upload is too large.", 413)
      const input = JSON.parse(body)
      if (typeof input.action !== "string" || !Array.isArray(input.args) || input.args.length > 6) throw new RequestError("Invalid operation.")
      action = input.action; args = input.args
    }
    return NextResponse.json(await execute(user, action, args, request.headers.get("x-signup-role") || undefined), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status })
    // Domain validation errors have no database code. Never return credentials or SQL details.
    if (error instanceof Error && !("code" in error) && !/SUPABASE|connect|fetch|database|certificate/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 })
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "DATABASE_UNAVAILABLE"
    if (code === "DATABASE_NOT_CONFIGURED") console.error("Set SUPABASE_DB_URL in .env.local using Supabase Connect > Session pooler, then run npm.cmd run db:init.")
    else if (code === "42P01" || code === "3F000") console.error("Supabase schema is missing. Run npm.cmd run db:init.")
    else console.error("Supabase data operation failed", { code })
    const setupErrors: Record<string, string> = {
      DATABASE_NOT_CONFIGURED: "Database setup is incomplete. Set SUPABASE_DB_URL in .env.local, run npm run db:init, and restart the development server.",
      ENOTFOUND: "The database hostname cannot be resolved. Check SUPABASE_DB_URL in .env.local; copy the Session pooler connection string from Supabase Connect, then restart the development server.",
    }
    const message = (process.env.NODE_ENV === "development" && setupErrors[code])
      || "Live data is temporarily unavailable. Please try again shortly."
    return NextResponse.json({ error: message, code }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
export const GET = handle
export const POST = handle
