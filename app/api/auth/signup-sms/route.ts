import { authenticate, RequestError } from "@/lib/server/data-service"
import { sendSignupSms, signupPhoneStatus, verifySignupSms, SmsVerificationError } from "@/lib/server/auth/signup-sms"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
async function handle(request: Request) {
  const headers = { "Cache-Control": "no-store" }
  try {
    const user = await authenticate(request, { allowUnverifiedPhone: true })
    if (!user || user.authSource === "clerk") throw new RequestError("Sign in with your email account to verify its mobile number.", 401)
    if (request.method === "GET") return Response.json(await signupPhoneStatus(user), { headers })
    const body = await request.text()
    if (body.length > 1024) throw new RequestError("Request too large.", 413)
    let input
    try { input = JSON.parse(body) } catch { throw new RequestError("Invalid request.") }
    if (!input || typeof input !== "object" || "phone" in input || "mobile" in input) throw new RequestError("The signup mobile number cannot be changed here.")
    if (input.action === "send") return Response.json(await sendSignupSms(user), { headers })
    if (input.action !== "verify" || typeof input.code !== "string") throw new RequestError("Invalid operation.")
    const verified = await verifySignupSms(user, input.code)
    return Response.json({ verified }, { status: verified ? 200 : 400, headers })
  } catch (error) {
    if (error instanceof RequestError || error instanceof SmsVerificationError) {
      const retryAfter = error instanceof SmsVerificationError ? error.retryAfter : undefined
      return Response.json({ error: error.message, retryAfter }, { status: error.status, headers: { ...headers, ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } })
    }
    return Response.json({ error: "Phone verification is temporarily unavailable. Please try again shortly." }, { status: 503, headers })
  }
}
export const GET = handle
export const POST = handle
