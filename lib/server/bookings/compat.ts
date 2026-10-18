import { currentTx, storage } from "../runtime"
import { RequestError } from "../request-error"
import type { Booking } from "../../marketplace/mock-data"
import { downpaymentFor, lockOwned, paidTotal, transition } from "./core"
import type { Actor } from "./rules"

// Projects table rows into the legacy `Booking` shape so existing screens keep working (AC26, AC27).
const ACCOUNTS_KEY = "soundstage-accounts-v2"
const DAY = 86400000
const REFUND_METHODS = ["GCash", "Maya", "Bank transfer"]
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : undefined

type Row = {
  id: string; client_email: string; provider_email: string; package_id: string | null; package_name: string; package_price: string
  base_price: string | null; transportation_fee: string | null; total: string | null; start_date: unknown; end_date: unknown
  event_time: string | null; event_type: string | null; location: string | null; event_town: string | null; guests: number | null
  notes: string | null; image: string | null; status: string; cancelled_by: string | null; feedback: Booking["feedback"] | string | null
  paid: string; paid_at: unknown; method: string | null; cancelled_at: unknown; completed_at: unknown; refund_reason: string | null; refund_at: unknown
  refund_decision: string | null; refund_decided_at: unknown; refund_note: string | null; approved_cancel: boolean
}

function names() {
  const accounts = JSON.parse(storage.getItem(ACCOUNTS_KEY) || "[]") as { email: string; firstName?: string; lastName?: string; business?: string }[]
  const byEmail = new Map(accounts.map(a => [a.email.toLowerCase(), a]))
  const person = (email: string) => { const a = byEmail.get(email); return a ? `${a.firstName || ""} ${a.lastName || ""}`.trim() || email : email }
  const business = (email: string) => byEmail.get(email)?.business || person(email)
  return { person, business }
}

// One query per call; the actor decides which rows are visible (design: compatibility projection).
async function rows(kind: "all" | "client" | "provider" | "id", value = "") {
  return currentTx()<Row[]>`select b.id, b.client_email, b.provider_email, b.package_id, b.package_name, b.package_price, b.base_price, b.transportation_fee, b.total,
      b.start_date, b.end_date, b.event_time, b.event_type, b.location, b.event_town, b.guests, b.notes, b.image, b.status, b.cancelled_by, b.feedback,
      coalesce(p.paid, 0) as paid, p.paid_at, p.method,
      (select max(h.created_at) from soundstage.booking_status_history h where h.booking_id = b.id and h.new_status = 'cancelled') as cancelled_at,
      (select max(h.created_at) from soundstage.booking_status_history h where h.booking_id = b.id and h.new_status = 'completed') as completed_at,
      r.reason as refund_reason, r.created_at as refund_at, d.new_status as refund_decision, d.created_at as refund_decided_at, d.reason as refund_note,
      exists (select 1 from soundstage.cancellation_requests c where c.booking_id = b.id and c.status = 'approved') as approved_cancel
    from soundstage.bookings b
    left join lateral (select sum(amount) as paid, max(paid_at) as paid_at, max(method) as method from soundstage.payments
      where target_kind = 'booking' and target_id = b.id::text and status in ('paid', 'partially_refunded')) p on true
    left join lateral (select reason, created_at, id from soundstage.booking_status_history where booking_id = b.id and new_status = 'refund_pending' order by id desc limit 1) r on true
    left join lateral (select new_status, created_at, reason from soundstage.booking_status_history where booking_id = b.id and old_status = 'refund_pending' and id > r.id order by id desc limit 1) d on true
    where (${kind} = 'all' or (${kind} = 'client' and b.client_email = ${value}) or (${kind} = 'provider' and b.provider_email = ${value}) or (${kind} = 'id' and b.id::text = ${value}))
    order by b.start_date desc, b.id`
}

function toBooking(row: Row, who: ReturnType<typeof names>): Booking {
  const start = dateText(row.start_date)
  const price = Number(row.package_price)
  const total = row.total === null ? price : Number(row.total)
  const paid = Number(row.paid)
  const feedback = typeof row.feedback === "string" ? JSON.parse(row.feedback) : row.feedback
  let refund: Booking["refund"]
  if (row.refund_reason) {
    const details = JSON.parse(row.refund_reason) as { method: string; account: string }
    const decided = row.refund_decision === "refunded" ? "Paid" : row.refund_decision === "cancelled" ? "Rejected" : "Pending"
    refund = { status: decided, amount: paid, method: details.method, account: details.account, requestedAt: iso(row.refund_at) || "",
      ...(decided !== "Pending" ? { processedAt: iso(row.refund_decided_at), ...(decided === "Paid" ? { reference: row.refund_note || "" } : { reason: row.refund_note || "" }) } : {}) }
  }
  return {
    id: row.id, packageId: row.package_id || "", packageName: row.package_name, provider: who.business(row.provider_email), client: who.person(row.client_email),
    image: row.image || "", date: start, time: row.event_time || "", ...(row.event_type ? { eventType: row.event_type } : {}), location: row.location || "",
    guests: row.guests ?? 0, notes: row.notes || "", durationDays: Math.round((Date.parse(dateText(row.end_date)) - Date.parse(start)) / DAY),
    basePrice: row.base_price === null ? price : Number(row.base_price), transportationFee: Number(row.transportation_fee || 0), eventTown: row.event_town || "",
    total, downpayment: downpaymentFor(total), status: row.status as Booking["status"], paid: paid >= downpaymentFor(total) && paid > 0,
    ...(row.paid_at ? { paidAt: iso(row.paid_at) } : {}), ...(row.completed_at ? { completedAt: iso(row.completed_at) } : {}),
    ...(row.cancelled_by ? { cancelledBy: (row.cancelled_by === "system" ? "client" : row.cancelled_by) as Booking["cancelledBy"] } : {}),
    ...(row.cancelled_at ? { cancelledAt: iso(row.cancelled_at) } : {}), ...(refund ? { refund } : {}),
    // Mirrors core "refundable": verified money, provider-side cancellation, no earlier request.
    ...(row.status === "cancelled" && paid > 0 && !row.refund_reason && (row.cancelled_by === "provider" || row.approved_cancel) ? { refundEligible: true } : {}), ...(feedback ? { feedback } : {}),
    ...(row.method ? { paymentMethod: row.method } : {}),
  }
}

export type Viewer = { email: string; role: string } | null
// Clients see their own, providers their own provider email, admin and payroll master everything.
export async function listVisible(viewer: Viewer) {
  if (!viewer) return []
  const email = viewer.email.toLowerCase()
  const kind = viewer.role === "admin" || viewer.role === "payroll_master" ? "all" : viewer.role === "client" || viewer.role === "provider" ? viewer.role : null
  if (!kind) return []
  const who = names()
  return (await rows(kind, email)).map(row => ({ clientEmail: row.client_email, booking: toBooking(row, who) }))
}

// Public ratings read completed rows only and expose nothing beyond what buildServiceRatings keeps.
export async function completedWithFeedback() {
  const who = names()
  return (await rows("all")).filter(r => r.status === "completed" && r.feedback).map(r => toBooking(r, who))
}

// Admin and payroll master may read any booking; others only their own (missing and not-owned look the same).
export async function getOwned(actor: Actor, id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new RequestError("Booking not found.", 404)
  if (actor.role !== "admin" && actor.role !== "payroll_master") await lockOwned(id, actor)
  const [found] = await rows("id", id)
  if (!found) throw new RequestError("Booking not found.", 404)
  return toBooking(found, names())
}

export async function submitFeedback(actor: Actor, id: unknown, rating: unknown, comment: unknown) {
  if (actor.role !== "client") throw new RequestError("You do not have permission for this operation.", 403)
  const row = await lockOwned(id, actor)
  if (row.status !== "completed") throw new RequestError("Feedback is available only for your completed events.")
  if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5 || typeof comment !== "string" || !comment.trim() || comment.trim().length > 2000) throw new RequestError("Choose 1–5 stars and enter feedback up to 2,000 characters.")
  const feedback = { rating, comment: comment.trim(), createdAt: new Date().toISOString() }
  const updated = await currentTx()<{ id: string }[]>`update soundstage.bookings set feedback = ${JSON.stringify(feedback)}::jsonb, updated_at = now() where id = ${row.id} and feedback is null returning id`
  if (!updated.length) throw new RequestError("Feedback has already been submitted for this event.")
  return feedback
}

export async function requestRefund(actor: Actor, id: unknown, method: unknown, account: unknown) {
  if (typeof method !== "string" || !REFUND_METHODS.includes(method) || typeof account !== "string" || account.trim().length < 6 || account.length > 200) throw new RequestError("Enter a valid payout method and account details.")
  // Payout details travel in the history reason so the refund decision has them (plan 4).
  return transition(id, "refund_pending", actor, JSON.stringify({ method, account: account.trim() }))
}

export async function reviewRefund(actor: Actor, id: unknown, status: unknown, details: unknown) {
  if (actor.role !== "payroll_master") throw new RequestError("You do not have permission for this operation.", 403)
  if ((status !== "Paid" && status !== "Rejected") || typeof details !== "string" || details.trim().length < 3 || details.length > 200) throw new RequestError("Enter a payout reference or rejection reason (3–200 characters).")
  const system: Actor = { id: "system", email: "", role: "system" }
  try { return await transition(id, status === "Paid" ? "refunded" : "cancelled", system, details.trim()) }
  catch (error) {
    if (error instanceof RequestError && error.status === 409) throw new RequestError("This refund is no longer pending.", 409)
    throw error
  }
}

export async function completedEarnings(providerEmail: string) {
  const [row] = await currentTx()<{ total: string | null }[]>`select coalesce(sum(p.amount), 0) as total from soundstage.payments p
    join soundstage.bookings b on p.target_kind = 'booking' and p.target_id = b.id::text
    where b.provider_email = ${providerEmail.toLowerCase()} and b.status = 'completed' and p.status in ('paid', 'partially_refunded') and p.method not like 'DEMO:%'`
  return Number(row?.total || 0)
}

export { paidTotal }
