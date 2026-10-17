import "server-only"
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { getDatabase } from "../db/database"
import { normalizePhilippineMobile } from "../../auth/phone"

type SignupUser = { id: string; user_metadata: Record<string, unknown> }
type Verification = {
  phone: string; nonce: string; otp_digest: string | null; expires_at: Date; sent_at: Date;
  window_started_at: Date; send_count: number; attempts: number; delivered: boolean; verified_at: Date | null;
}
export class SmsVerificationError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) { super(message) }
}
export function demoSignupOtpEnabled() {
  return process.env.ENABLE_DEMO_OTP === "true" && process.env.NODE_ENV !== "production"
}
const DEMO_CODE = "123456"
function isDemoNonce(nonce: string) { return nonce.startsWith("demo:") }
function acceptedVerification(row: Verification) {
  return Boolean(row.verified_at && (!isDemoNonce(row.nonce) || demoSignupOtpEnabled()))
}
function credentials() {
  const token = process.env.PHILSMS_API_TOKEN?.trim()
  const sender = process.env.PHILSMS_SENDER_ID?.trim()
  if (!token || !sender) throw new SmsVerificationError("SMS delivery is not configured. Please contact support.", 503)
  return { token, sender }
}
function digest(userId: string, nonce: string, code: string) {
  const key = isDemoNonce(nonce) ? "soundstage-local-demo-otp" : credentials().token
  return createHmac("sha256", key).update(`${userId}:${nonce}:${code}`).digest("hex")
}
export async function signupPhoneStatus(user: SignupUser) {
  const rows = await getDatabase()<Verification[]>`select * from soundstage.signup_phone_verifications where auth_id=${user.id}`
  const row = rows[0]
  let phone = row?.phone || ""
  if (!phone) {
    try { phone = normalizePhilippineMobile(String(user.user_metadata.mobile || "")) }
    catch { throw new SmsVerificationError("Your signup mobile number is missing or invalid. Please contact support.") }
  }
  const demo = demoSignupOtpEnabled()
  const sameMode = row && isDemoNonce(row.nonce) === demo
  return { phone, verified: Boolean(row && acceptedVerification(row)), demo,
    demoCode: demo && sameMode && row.delivered && !row.verified_at && new Date(row.expires_at).getTime() > Date.now() ? DEMO_CODE : undefined,
    retryAfter: sameMode ? Math.max(0, Math.ceil((new Date(row.sent_at).getTime() + 60000 - Date.now()) / 1000)) : 0 }
}
export async function hasVerifiedSignupPhone(userId: string) {
  const rows = await getDatabase()`select 1 from soundstage.signup_phone_verifications where auth_id=${userId} and verified_at is not null and (${demoSignupOtpEnabled()} or nonce not like 'demo:%')`
  return rows.length > 0
}
export async function sendSignupSms(user: SignupUser) {
  const demo = demoSignupOtpEnabled()
  const { token, sender } = demo ? { token: "", sender: "" } : credentials()
  const sql = getDatabase()
  const code = demo ? DEMO_CODE : String(randomInt(0, 1000000)).padStart(6, "0")
  const nonce = (demo ? "demo:" : "") + randomUUID()
  const otpDigest = digest(user.id, nonce, code)
  const reserved = await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`
    const rows = await tx<Verification[]>`select * from soundstage.signup_phone_verifications where auth_id=${user.id} for update`
    const row = rows[0]
    if (row && acceptedVerification(row)) return { phone: row.phone, verified: true }
    // Once reserved, the number never changes through this endpoint or metadata edits.
    let phone = row?.phone
    if (!phone) {
      try { phone = normalizePhilippineMobile(String(user.user_metadata.mobile || "")) }
      catch { throw new SmsVerificationError("Your signup mobile number is missing or invalid. Please contact support.") }
    }
    await tx`select pg_advisory_xact_lock(hashtextextended(${phone}, 1))`
    const now = Date.now()
    const sameMode = row && isDemoNonce(row.nonce) === demo
    if (sameMode && now - new Date(row.sent_at).getTime() < 60000) {
      const seconds = Math.ceil((new Date(row.sent_at).getTime() + 60000 - now) / 1000)
      throw new SmsVerificationError(`Please wait ${seconds} seconds before requesting another code.`, 429, seconds)
    }
    const totals = await tx`select coalesce(sum(send_count), 0)::int as count from soundstage.signup_phone_verifications where phone=${phone} and (nonce like 'demo:%')=${demo} and window_started_at > now() - interval '1 hour'`
    if (totals[0].count >= 5) throw new SmsVerificationError("Too many SMS requests. Please try again in an hour.", 429, 3600)
    const sameWindow = sameMode && now - new Date(row.window_started_at).getTime() < 3600000
    await tx`insert into soundstage.signup_phone_verifications
      (auth_id,phone,nonce,otp_digest,expires_at,sent_at,window_started_at,send_count)
      values (${user.id},${phone},${nonce},${otpDigest},now() + interval '5 minutes',now(),now(),1)
      on conflict (auth_id) do update set nonce=excluded.nonce,otp_digest=excluded.otp_digest,
        expires_at=excluded.expires_at,sent_at=excluded.sent_at,
        window_started_at=${sameWindow ? row.window_started_at : new Date(now)},
        send_count=${sameWindow ? row.send_count + 1 : 1},attempts=0,delivered=false,verified_at=null`
    return { phone, verified: false }
  })
  if (reserved.verified) return { ...reserved, retryAfter: 0 }
  if (demo) {
    await sql`update soundstage.signup_phone_verifications set delivered=true where auth_id=${user.id} and nonce=${nonce}`
    return { ...reserved, demo: true, demoCode: DEMO_CODE, retryAfter: 60 }
  }
  // Commit the reservation before network I/O, preserving cooldowns even on failure.
  try {
    const response = await fetch("https://dashboard.philsms.com/api/v3/sms/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ recipient: reserved.phone.slice(1), sender_id: sender, type: "plain", message: `Your SoundStage verification code is ${code}. It expires in 5 minutes. Do not share this code.` }),
      signal: AbortSignal.timeout(10000),
    })
    const result = await response.json()
    if (!response.ok || result?.status !== "success") throw new Error("Delivery rejected")
    await sql`update soundstage.signup_phone_verifications set delivered=true where auth_id=${user.id} and nonce=${nonce}`
  } catch {
    await sql`update soundstage.signup_phone_verifications set otp_digest=null where auth_id=${user.id} and nonce=${nonce}`
    throw new SmsVerificationError("SMS could not be sent. Please try again in 60 seconds or contact support.", 502, 60)
  }
  return { ...reserved, retryAfter: 60 }
}
export async function verifySignupSms(user: SignupUser, code: string) {
  if (!/^\d{6}$/.test(code)) return false
  return getDatabase().begin(async tx => {
    const rows = await tx<Verification[]>`select * from soundstage.signup_phone_verifications where auth_id=${user.id} for update`
    const row = rows[0]
    if (row && isDemoNonce(row.nonce) && !demoSignupOtpEnabled()) return false
    if (!row || row.verified_at || !row.delivered || !row.otp_digest || row.attempts >= 5 || new Date(row.expires_at).getTime() <= Date.now()) return false
    const valid = timingSafeEqual(Buffer.from(row.otp_digest, "hex"), Buffer.from(digest(user.id, row.nonce, code), "hex"))
    // Return instead of throwing so incorrect-attempt counters are committed.
    await tx`update soundstage.signup_phone_verifications set attempts=attempts+1,
      verified_at=${valid ? new Date() : null},otp_digest=${valid ? null : row.otp_digest} where auth_id=${user.id}`
    return valid
  })
}
