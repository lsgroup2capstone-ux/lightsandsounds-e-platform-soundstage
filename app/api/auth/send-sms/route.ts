import { Webhook } from "standardwebhooks"
import { normalizePhilippineMobile } from "@/lib/phone"

export const runtime = "nodejs"

function failure(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status })
}

// Only signed Supabase Auth hooks may send messages. Never accept a browser's OTP.
export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SEND_SMS_HOOK_SECRET?.trim()
  const token = process.env.PHILSMS_API_TOKEN?.trim()
  const sender = process.env.PHILSMS_SENDER_ID?.trim()
  if (!secret || !token || !sender) return failure(503, "SMS delivery is not configured.")
  const body = await request.text()
  if (body.length > 65536) return failure(413, "Payload too large.")
  let event: { user?: { phone?: string }; sms?: { otp?: string } }
  try {
    event = new Webhook(secret.replace(/^v1,/, "")).verify(body, Object.fromEntries(request.headers)) as typeof event
  } catch {
    return failure(401, "Invalid hook signature.")
  }
  let recipient: string
  try {
    recipient = normalizePhilippineMobile(event?.user?.phone ?? "").slice(1)
    if (typeof event?.sms?.otp !== "string" || !/^\d{6}$/.test(event.sms.otp)) throw new Error("Invalid code")
  } catch {
    return failure(400, "Invalid SMS payload.")
  }
  try {
    const response = await fetch("https://dashboard.philsms.com/api/v3/sms/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ recipient, sender_id: sender, type: "plain", message: `Your SoundStage verification code is ${event.sms!.otp}. Do not share this code.` }),
      signal: AbortSignal.timeout(4000),
    })
    const result = await response.json()
    if (!response.ok || result?.status !== "success") return failure(502, "SMS delivery failed. Please try again.")
    return Response.json({})
  } catch {
    return failure(502, "SMS delivery failed. Please try again.")
  }
}
