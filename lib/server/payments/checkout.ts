import { currentTx } from "../runtime"
import { RequestError } from "../request-error"
import { downpaymentFor, lockOwned, paidTotal } from "../bookings/core"
import type { Actor } from "../bookings/rules"
import { createCheckout, paymongo } from "./paymongo"

export type PaymentType = "downpayment" | "full" | "balance" | "subscription"
type Open = { id: string; checkout_url: string | null }
type Status = { id: string; owner_email: string; target_kind: string; status: string; checkout_url: string | null; checkout_session_id: string | null }
const BUSY = "A checkout for this payment is already being started. Please try again in a moment."

// Amounts come only from the server; one open checkout per target and type (D7, D12).
export async function startCheckout(input: { ownerEmail: string; targetKind: "booking" | "subscription"; targetId: string; type: PaymentType; name: string; amount: number; method: string; plan?: string }) {
  const tx = currentTx()
  const [open] = await tx<Open[]>`select id, checkout_url from soundstage.payments where target_id = ${input.targetId} and type = ${input.type} and status = 'pending' for update`
  if (open?.checkout_url) return { id: open.id, checkoutUrl: open.checkout_url }
  // A pending row without a URL is another request still starting its checkout.
  if (open) throw new RequestError(BUSY, 409)
  if (!(input.amount > 0)) throw new RequestError("Nothing is left to pay.")
  // The payment id doubles as the PayMongo reference, so the webhook can match it exactly.
  const id = crypto.randomUUID()
  let url: URL
  let sessionId: string
  try {
    const checkout = await createCheckout(id, input.name, input.amount, input.method)
    url = new URL(checkout.attributes.checkout_url)
    sessionId = String(checkout.id)
  } catch (error) {
    if (error instanceof Error && error.message === "Select a payment method.") throw new RequestError(error.message)
    throw new RequestError("Checkout could not be started. Please try again.", 503)
  }
  if (url.protocol !== "https:" || url.hostname !== "checkout.paymongo.com") throw new RequestError("Checkout could not be started. Please try again.", 503)
  try {
    await tx`insert into soundstage.payments (id, target_kind, target_id, owner_email, type, plan, amount, checkout_session_id, checkout_url)
      values (${id}::uuid, ${input.targetKind}, ${input.targetId}, ${input.ownerEmail.toLowerCase()}, ${input.type}, ${input.plan ?? null}, ${input.amount}, ${sessionId}, ${url.href})`
  } catch (error) {
    // A concurrent first request won the one-pending index (D12); this one stores nothing.
    if ((error as { code?: string }).code === "23505") throw new RequestError(BUSY, 409)
    throw error
  }
  return { id, checkoutUrl: url.href }
}

export async function startBookingPayment(actor: Actor, bookingId: unknown, type: unknown, method: unknown) {
  if (actor.role !== "client") throw new RequestError("You do not have permission for this operation.", 403)
  if (type !== "downpayment" && type !== "full" && type !== "balance") throw new RequestError("Choose a payment type.")
  if (typeof method !== "string" || !method.trim() || method.length > 50) throw new RequestError("Select a payment method.")
  const row = await lockOwned(bookingId, actor)
  const price = Number(row.price)
  const paid = await paidTotal(row.id)
  let amount: number
  if (type === "downpayment") {
    if (row.status !== "awaiting_payment" || paid > 0) throw new RequestError(`A downpayment is not available for a booking that is ${row.status}${paid > 0 ? " and already has a payment" : ""}.`, 409)
    amount = downpaymentFor(price)
  } else if (type === "full") {
    if (row.status !== "awaiting_payment") throw new RequestError(`Cannot pay in full for a booking that is ${row.status}.`, 409)
    amount = price - paid
  } else {
    if (row.status !== "confirmed" || price - paid <= 0) throw new RequestError(`No balance is due for a booking that is ${row.status}.`, 409)
    amount = price - paid
  }
  return startCheckout({ ownerEmail: actor.email, targetKind: "booking", targetId: row.id, type, name: `Booking ${type}`, amount, method })
}

async function ownPayment(actor: Actor, id: unknown, lock = false) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new RequestError("Payment not found.", 404)
  const tx = currentTx()
  const [row] = lock
    ? await tx<Status[]>`select id, owner_email, target_kind, status, checkout_url, checkout_session_id from soundstage.payments where id = ${id}::uuid for update`
    : await tx<Status[]>`select id, owner_email, target_kind, status, checkout_url, checkout_session_id from soundstage.payments where id = ${id}::uuid`
  // Missing and not-owned look the same (AC18).
  if (!row || (actor.role !== "admin" && row.owner_email !== actor.email.toLowerCase())) throw new RequestError("Payment not found.", 404)
  return row
}

// Read-only: the return page never settles anything (AC17, AC18).
export async function getPaymentStatus(actor: Actor, id: unknown) {
  const row = await ownPayment(actor, id)
  return { status: row.status, kind: row.target_kind, ...(row.status === "pending" && row.checkout_url ? { checkoutUrl: row.checkout_url } : {}) }
}

// Expiring can never mark a payment paid; a paid webhook for it goes to review.
export async function cancelPayment(actor: Actor, id: unknown) {
  const row = await ownPayment(actor, id, true)
  if (row.status !== "pending") return { status: row.status, kind: row.target_kind }
  if (row.checkout_session_id) {
    try { await paymongo("/" + encodeURIComponent(row.checkout_session_id) + "/expire", undefined, "POST") }
    catch { throw new RequestError("Checkout could not be cancelled. Please try again.", 503) }
  }
  await currentTx()`update soundstage.payments set status = 'expired', updated_at = now() where id = ${row.id}`
  return { status: "expired", kind: row.target_kind }
}
