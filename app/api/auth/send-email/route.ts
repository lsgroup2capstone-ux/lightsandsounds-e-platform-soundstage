import { Webhook } from "standardwebhooks"
import nodemailer from "nodemailer"

export const runtime = "nodejs"

type EmailEvent = {
  user?: { email?: string; new_email?: string }
  email_data?: { email_action_type?: string; token?: string; token_new?: string; token_hash_new?: string }
}
function failure(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status, headers: { "Cache-Control": "no-store" } })
}
function address(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value)
}

// Supabase generates and validates the OTP; this signed hook only delivers it.
export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET?.trim()
  const sender = process.env.GMAIL_SMTP_USER?.trim()
  const password = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "")
  if (!secret || !address(sender) || !password) return failure(503, "Email delivery is not configured.")
  const body = await request.text()
  if (body.length > 65536) return failure(413, "Payload too large.")
  let event: EmailEvent
  try {
    event = new Webhook(secret.replace(/^v1,/, "")).verify(body, Object.fromEntries(request.headers)) as EmailEvent
  } catch { return failure(401, "Invalid hook signature.") }

  const data = event?.email_data
  const action = data?.email_action_type
  const titles: Record<string, string> = {
    recovery: "Reset your SoundStage password",
    signup: "Verify your SoundStage email",
    magiclink: "Your SoundStage sign-in code",
    invite: "Your SoundStage invitation code",
    reauthentication: "Verify your SoundStage identity",
    email_change: "Confirm your SoundStage email change",
  }
  if (!action || !Object.hasOwn(titles, action)) return failure(400, "Unsupported email action.")
  const messages = action === "email_change"
    ? data?.token && data?.token_new && data?.token_hash_new
      ? [{ to: event.user?.email, code: data.token }, { to: event.user?.new_email, code: data.token_new }]
      : [{ to: event.user?.new_email, code: data?.token_new || data?.token }]
    : [{ to: event.user?.email, code: data?.token }]
  if (messages.some(message => !address(message.to) || typeof message.code !== "string" || !/^\d{6}$/.test(message.code))) {
    return failure(400, "Invalid email payload. Email OTP length must be 6.")
  }
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: sender, pass: password },
    connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 4000,
    logger: false, debug: false,
  })
  try {
    await Promise.all(messages.map(({ to, code }) => transport.sendMail({
      from: { name: "SoundStage", address: sender }, to: { address: to!, name: "" },
      subject: titles[action],
      text: `${titles[action]}\n\nYour 6-digit code is: ${code}\n\nEnter it in SoundStage. This code can only be used once. If it expires, request a new one. If you did not request this, ignore this email. Do not share this code.`,
      html: `<h2>${titles[action]}</h2><p>Enter this 6-digit code in SoundStage:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code can only be used once. If it expires, request a new code.</p><p>If you did not request this, ignore this email. Do not share this code.</p>`,
    })))
    return Response.json({}, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return failure(502, "Gmail could not deliver the verification email. Check the sender credentials and Gmail account settings.")
  } finally { transport.close() }
}
