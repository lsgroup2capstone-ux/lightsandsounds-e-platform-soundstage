import { currentTx } from "../runtime"
import { confirmFromPayment } from "../bookings/core"
import { activateSubscription, execute } from "../data-service"
import { paymentKey, verifyWebhook } from "./paymongo"

const MAX_BODY = 1000000
type Resource = { id?: unknown; attributes?: Record<string, any> }
type Event = { id: string; type: string; livemode?: boolean; data: Resource }
type Payment = { id: string; target_kind: string; target_id: string; owner_email: string; plan: string | null; amount: string; status: string }

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
    // Rolled back: PayMongo retries and the event id was never stored (AC11).
    console.error("PayMongo webhook failed", { status: 503 })
    return Response.json({ error: "Payment notification could not be processed." }, { status: 503 })
  }
}

async function lockPayment(column: "checkout_session_id" | "id", value: unknown) {
  if (typeof value !== "string" || !value) return null
  if (column === "id" && !/^[0-9a-f-]{36}$/i.test(value)) return null
  const tx = currentTx()
  const rows = column === "id"
    ? await tx<Payment[]>`select id, target_kind, target_id, owner_email, plan, amount, status from soundstage.payments where id = ${value}::uuid for update`
    : await tx<Payment[]>`select id, target_kind, target_id, owner_email, plan, amount, status from soundstage.payments where checkout_session_id = ${value} for update`
  return rows[0] || null
}

const setStatus = (id: string, status: string, reason: string | null = null) =>
  currentTx()`update soundstage.payments set status = ${status}, review_reason = coalesce(${reason}, review_reason), updated_at = now() where id = ${id}`

export async function processEvent(event: Event) {
  const tx = currentTx()
  // The event id is stored in the same transaction as its effects; a repeat is a no-op (AC9, AC10).
  const inserted = await tx<{ id: string }[]>`insert into soundstage.payment_events (id, type) values (${event.id}, ${event.type}) on conflict (id) do nothing returning id`
  if (!inserted.length) return { duplicate: true }
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
  await currentTx()`update soundstage.payment_events set payment_id = ${payment.id} where id = ${event.id}`
  const a = session.attributes || {}
  const cents = Math.round(Number(payment.amount) * 100)
  const match = (a.payments as Resource[] | undefined)?.find(p => p.attributes?.status === "paid" && p.attributes.currency === "PHP" && p.attributes.amount === cents)
  const exact = a.reference_number === payment.id && a.livemode === paymentKey().startsWith("sk_live_") && match
  if (payment.status !== "pending") {
    // Money arrived for a payment we no longer expect; a person must look at it.
    if (payment.status !== "paid") await setStatus(payment.id, "review", `paid event while ${payment.status}`)
    return { status: payment.status }
  }
  if (!exact) {
    await setStatus(payment.id, "review", "paid event did not match amount, currency, mode or reference")
    console.error("PayMongo payment sent to review", { payment: payment.id })
    return { status: "review" }
  }
  const method = `${a.livemode ? "PayMongo" : "DEMO: PayMongo test"}: ${match.attributes?.source?.type || "payment"}`
  await currentTx()`update soundstage.payments set status = 'paid', paid_at = now(), method = ${method}, provider_reference = ${String(match.id || "")}, updated_at = now() where id = ${payment.id}`
  if (payment.target_kind === "subscription") {
    activateSubscription({ id: payment.id, email: payment.owner_email, plan: payment.plan, amount: Number(payment.amount), method, reference: String(match.id || "") })
    return { status: "paid" }
  }
  const outcome = await confirmFromPayment(payment.target_id)
  // A late payment cannot confirm; it waits for a refund decision (AC16, booking AC17).
  if (!outcome.confirmed && (outcome.reason === "hold_expired" || outcome.reason === "dates_taken")) {
    await setStatus(payment.id, "review", outcome.reason)
    console.error("PayMongo payment sent to review", { payment: payment.id, reason: outcome.reason })
    return { status: "review" }
  }
  return { status: "paid", confirmed: outcome.confirmed }
}

// payment.failed carries a payment resource; checkout-created payments echo our reference.
async function failed(event: Event) {
  const a = event.data.attributes || {}
  const reference = a.reference_number ?? a.external_reference_number ?? a.metadata?.reference_number
  const payment = await lockPayment("id", reference)
  if (!payment) return { unknown: true }
  await currentTx()`update soundstage.payment_events set payment_id = ${payment.id} where id = ${event.id}`
  if (payment.status === "pending") await setStatus(payment.id, "failed")
  return { status: payment.status === "pending" ? "failed" : payment.status }
}
