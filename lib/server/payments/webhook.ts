import { currentTx } from "../runtime"
import { confirmFromPayment } from "../bookings/core"
import { activateSubscription, execute } from "../data-service"
import { paymentKey, verifyWebhook } from "./paymongo"

const MAX_BODY = 1000000
type Resource = { id?: unknown; attributes?: Record<string, any> }
type Event = { id: string; type: string; livemode?: boolean; data: Resource }
type Payment = { payment_id: string; booking_id: string | null; subscription_id: string | null; amount: string; payment_status: string }

export async function handleWebhook(raw: string, signature: string | null) {
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 })
  try {
    // Signature over the raw body comes before any parsing (AC8).
    if (!verifyWebhook(raw, signature)) return new Response(null, { status: 401 })
    const data = JSON.parse(raw).data
    if (typeof data?.id !== "string" || !data.id || typeof data.attributes?.type !== "string") return new Response(null, { status: 400 })
    const event: Event = { id: data.id, type: data.attributes.type, livemode: data.attributes.livemode, data: data.attributes.data || {} }
    await execute(null, undefined, [], undefined, () => processEvent(event))
    return Response.json({ received: true })
  } catch {
    // Rolled back: PayMongo retries and nothing was changed (AC11).
    console.error("PayMongo webhook failed", { status: 503 })
    return Response.json({ error: "Payment notification could not be processed." }, { status: 503 })
  }
}

async function lockPayment(column: "checkout_session_id" | "payment_id", value: unknown) {
  if (typeof value !== "string" || !value) return null
  if (column === "payment_id" && !/^\d{1,18}$/.test(value)) return null
  const tx = currentTx()
  const rows = column === "payment_id"
    ? await tx<Payment[]>`select payment_id, booking_id, subscription_id, amount, payment_status from soundstage.payments where payment_id = ${value} for update`
    : await tx<Payment[]>`select payment_id, booking_id, subscription_id, amount, payment_status from soundstage.payments where checkout_session_id = ${value} for update`
  return rows[0] || null
}

const setStatus = (id: string, status: string, reason: string | null = null) =>
  currentTx()`update soundstage.payments set payment_status = ${status}, review_reason = coalesce(${reason}::text, review_reason), updated_at = now() where payment_id = ${id}`

// Repeated events are harmless: each step only moves a payment out of 'pending' once (AC9, AC10).
export async function processEvent(event: Event) {
  if (event.type === "checkout_session.payment.paid") return paid(event)
  if (event.type === "payment.failed") return failed(event)
  return { ignored: true }
}

async function paid(event: Event) {
  const session = event.data
  const payment = await lockPayment("checkout_session_id", session.id)
  if (!payment) {
    console.error("PayMongo paid event for an unknown checkout session")
    return { unknown: true }
  }
  const id = String(payment.payment_id)
  const a = session.attributes || {}
  const cents = Math.round(Number(payment.amount) * 100)
  const match = (a.payments as Resource[] | undefined)?.find(p => p.attributes?.status === "paid" && p.attributes.currency === "PHP" && p.attributes.amount === cents)
  const exact = a.reference_number === id && a.livemode === paymentKey().startsWith("sk_live_") && match
  if (payment.payment_status !== "pending") {
    // Money arrived for a payment we no longer expect; a person must look at it.
    if (payment.payment_status !== "paid" && payment.payment_status !== "review") await setStatus(id, "review", `paid event while ${payment.payment_status}`)
    return { status: payment.payment_status === "paid" ? "paid" : "review", duplicate: payment.payment_status === "paid" }
  }
  if (!exact) {
    await setStatus(id, "review", "paid event did not match amount, currency, mode or reference")
    console.error("PayMongo payment sent to review", { payment: id })
    return { status: "review" }
  }
  const method = `${a.livemode ? "PayMongo" : "DEMO: PayMongo test"}: ${match.attributes?.source?.type || "payment"}`.slice(0, 50)
  await currentTx()`update soundstage.payments set payment_status = 'paid', paid_at = now(), payment_method = ${method}, reference_number = ${String(match.id || "").slice(0, 100) || null}, updated_at = now() where payment_id = ${id}`
  if (payment.subscription_id) {
    await activateSubscription(String(payment.subscription_id))
    return { status: "paid" }
  }
  const outcome = await confirmFromPayment(String(payment.booking_id))
  // A late payment cannot confirm; it waits for a refund decision (AC16, booking AC17).
  if (!outcome.confirmed && (outcome.reason === "hold_expired" || outcome.reason === "dates_taken")) {
    await setStatus(id, "review", outcome.reason)
    console.error("PayMongo payment sent to review", { payment: id, reason: outcome.reason })
    return { status: "review" }
  }
  return { status: "paid", confirmed: outcome.confirmed }
}

// payment.failed carries a payment resource; checkout-created payments echo our reference.
async function failed(event: Event) {
  const a = event.data.attributes || {}
  const reference = a.reference_number ?? a.external_reference_number ?? a.metadata?.reference_number
  const payment = await lockPayment("payment_id", reference)
  if (!payment) return { unknown: true }
  const id = String(payment.payment_id)
  if (payment.payment_status === "pending") {
    await setStatus(id, "failed")
    if (payment.subscription_id) await currentTx()`update soundstage.subscriptions set status = 'cancelled' where subscription_id = ${payment.subscription_id} and status = 'pending'`
  }
  return { status: payment.payment_status === "pending" ? "failed" : payment.payment_status }
}
