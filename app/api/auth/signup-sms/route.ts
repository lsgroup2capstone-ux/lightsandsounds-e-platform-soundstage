// Legacy Supabase signup phone verification is retired: Clerk verifies sign-ups, and its
// soundstage.signup_phone_verifications table is not part of the 11 core tables.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const gone = () => Response.json({ error: "Phone verification for this sign-up method is no longer available. Sign in with your account instead." }, { status: 410, headers: { "Cache-Control": "no-store" } })
export const GET = gone
export const POST = gone
