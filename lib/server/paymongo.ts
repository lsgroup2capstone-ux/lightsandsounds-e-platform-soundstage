import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

export function paymentKey() {
  const key = process.env.PAYMONGO_SECRET_KEY || ""
  if (!/^sk_(test|live)_/.test(key)) throw new Error("Configure PAYMONGO_SECRET_KEY to enable checkout.")
  return key
}
export async function paymongo(path: string, attributes?: unknown, method?: "POST") {
  const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions${path}`, {
    method: method || (attributes ? "POST" : "GET"), cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${paymentKey()}:`).toString("base64")}`, "Content-Type": "application/json" },
    ...(attributes ? { body: JSON.stringify({ data: { attributes } }) } : {}),
  })
  if (!response.ok) throw new Error("PayMongo could not process the request. Please try again or contact support.")
  const body = await response.json()
  if (!body.data?.id || !body.data.attributes) throw new Error("Invalid PayMongo response.")
  return body.data
}
export async function createCheckout(id: string, name: string, amount: number, method: string) {
  const methods: Record<string, string> = { GCash: "gcash", Maya: "paymaya", "GCash QR": "qrph", "Maya QR": "qrph", "Credit / Debit card": "card" }
  if (!methods[method]) throw new Error("Select a payment method.")
  const origin = new URL(process.env.APP_URL || "http://localhost:3000").origin
  return paymongo("", {
    line_items: [{ name, amount: Math.round(amount * 100), currency: "PHP", quantity: 1 }],
    payment_method_types: [methods[method]], reference_number: id,
    success_url: `${origin}/payment/return?id=${id}`, cancel_url: `${origin}/payment/return?id=${id}&cancelled=1`,
  })
}
export function verifyWebhook(body: string, header: string | null) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET
  if (!secret) throw new Error("Webhook is not configured.")
  const parts = Object.fromEntries((header || "").split(",").map(p => p.trim().split("=")))
  const signature = parts[paymentKey().startsWith("sk_live_") ? "li" : "te"] || ""
  if (!/^\d+$/.test(parts.t || "") || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300 || !/^[a-f0-9]{64}$/i.test(signature)) return false
  const expected = createHmac("sha256", secret).update(`${parts.t}.${body}`).digest()
  return timingSafeEqual(expected, Buffer.from(signature, "hex"))
}
