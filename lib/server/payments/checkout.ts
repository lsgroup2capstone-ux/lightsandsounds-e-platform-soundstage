import { currentTx } from "../runtime"
import { RequestError } from "../request-error"
import { downpaymentFor, lockOwned, paidTotal } from "../bookings/core"
import type { Actor } from "../bookings/rules"
import { requireUserId, userIdByEmail } from "../db/users"
import { createCheckout, paymongo } from "./paymongo"

export type PaymentType = "downpayment" | "full" | "balance" | "subscription"
type Status = { payment_id: string; user_id: string; booking_id: string | null; payment_status: string; checkout_url: string | null; checkout_session_id: string | null }
const BUSY = "A checkout for this payment is already being started. Please try again in a moment."
const isPaymentId = (value: unknown): value is string => typeof value === "string" && /^\d{1,18}$/.test(value)

// Amounts come only from the server; one open checkout per booking (or plan) and type (D7, D12).
// The payment row is created first; its payment_id is the reference PayMongo echoes back to the webhook.
export async function startCheckout(input: { ownerEmail: string; target: { bookingId: string } | { plan: string }; type: PaymentType; name: string; amount: number; method: string }) {
  const tx = currentTx()
  const userId = await requireUserId(tx, input.ownerEmail)
  const [open] = "bookingId" in input.target
    ? await tx<{ payment_id: string; checkout_url: string | null }[]>`select payment_id, checkout_url from soundstage.payments
        where booking_id = ${input.target.bookingId} and payment_type = ${input.type} and payment_status = 'pending' for update`
    : await tx<{ payment_id: string; checkout_url: string | null }[]>`select payment_id, checkout_url from soundstage.payments
        where user_id = ${userId} and payment_type = 'subscription' and payment_status = 'pending' and checkout_session_id is not null for update`
  if (open?.checkout_url) return { id: String(open.payment_id), checkoutUrl: open.checkout_url }
  // A pending row without a URL is another request still starting its checkout.
  if (open) throw new RequestError(BUSY, 409)
  if (!(input.amount > 0)) throw new RequestError("Nothing is left to pay.")
  let row: { payment_id: string }
  try {
    if ("bookingId" in input.target) {
      ;[row] = await tx<{ payment_id: string }[]>`insert into soundstage.payments (booking_id, user_id, amount, payment_type, payment_method)
        values (${input.target.bookingId}, ${userId}, ${input.amount}, ${input.type}, ${input.method.slice(0, 50)}) returning payment_id`
    } else {
      // The plan waits as a pending subscription until the verified payment activates it.
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())
      const [subscription] = await tx<{ subscription_id: string }[]>`insert into soundstage.subscriptions (provider_id, plan_type, price, start_date, end_date, status)
        values (${userId}, ${input.target.plan}, ${input.amount}, ${today}::date, ${today}::date, 'pending') returning subscription_id`
      ;[row] = await tx<{ payment_id: string }[]>`insert into soundstage.payments (subscription_id, user_id, amount, payment_type, payment_method)
        values (${subscription.subscription_id}, ${userId}, ${input.amount}, 'subscription', ${input.method.slice(0, 50)}) returning payment_id`
    }
  } catch (error) {
    // A concurrent first request won the one-pending index (D12); this one stores nothing.
    if ((error as { code?: string }).code === "23505") throw new RequestError(BUSY, 409)
    throw error
  }
  const id = String(row.payment_id)
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
  await tx`update soundstage.payments set checkout_session_id = ${sessionId}, checkout_url = ${url.href}, updated_at = now() where payment_id = ${id}`
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
  return startCheckout({ ownerEmail: actor.email, target: { bookingId: row.id }, type, name: `Booking ${type}`, amount, method })
}

async function ownPayment(actor: Actor, id: unknown, lock = false) {
  if (!isPaymentId(id)) throw new RequestError("Payment not found.", 404)
  const tx = currentTx()
  const [row] = lock
    ? await tx<Status[]>`select payment_id, user_id, booking_id, payment_status, checkout_url, checkout_session_id from soundstage.payments where payment_id = ${id} for update`
    : await tx<Status[]>`select payment_id, user_id, booking_id, payment_status, checkout_url, checkout_session_id from soundstage.payments where payment_id = ${id}`
  // Missing and not-owned look the same (AC18).
  const userId = await userIdByEmail(tx, actor.email)
  if (!row || (actor.role !== "admin" && Number(row.user_id) !== userId)) throw new RequestError("Payment not found.", 404)
  return { ...row, kind: row.booking_id ? "booking" : "subscription" }
}

// Read-only: the return page never settles anything (AC17, AC18).
export async function getPaymentStatus(actor: Actor, id: unknown) {
  const row = await ownPayment(actor, id)
  return { status: row.payment_status, kind: row.kind, ...(row.payment_status === "pending" && row.checkout_url ? { checkoutUrl: row.checkout_url } : {}) }
}

// Expiring can never mark a payment paid; a paid webhook for it goes to review.
export async function cancelPayment(actor: Actor, id: unknown) {
  const row = await ownPayment(actor, id, true)
  if (row.payment_status !== "pending") return { status: row.payment_status, kind: row.kind }
  if (row.checkout_session_id) {
    try { await paymongo("/" + encodeURIComponent(row.checkout_session_id) + "/expire", undefined, "POST") }
    catch { throw new RequestError("Checkout could not be cancelled. Please try again.", 503) }
  }
  const tx = currentTx()
  const [payment] = await tx<{ subscription_id: string | null }[]>`update soundstage.payments set payment_status = 'expired', updated_at = now() where payment_id = ${row.payment_id} returning subscription_id`
  if (payment?.subscription_id) await tx`update soundstage.subscriptions set status = 'cancelled' where subscription_id = ${payment.subscription_id} and status = 'pending'`
  return { status: "expired", kind: row.kind }
}
