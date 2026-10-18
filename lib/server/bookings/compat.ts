import { currentTx } from "../runtime"
import { RequestError } from "../request-error"
import type { Booking } from "../../marketplace/mock-data"
import { userIdByEmail } from "../db/users"
import { audit, downpaymentFor, isBookingId, lockOwned, paidTotal, transition } from "./core"
import type { Actor } from "./rules"

// Projects table rows into the screens' `Booking` shape so existing screens keep working (AC26, AC27).
const DAY = 86400000
const REFUND_METHODS = ["GCash", "Maya", "Bank transfer"]
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : undefined

type Row = {
  id: string; client_email: string; provider_email: string; package_id: string; package_name: string; package_price: string
  transportation_fee: string; total_amount: string; start_date: unknown; end_date: unknown
  event_time: string | null; event_type: string | null; location: string | null; event_town: string | null; guests: number | null
  notes: string | null; image: string | null; status: string; cancelled_by: string | null
  c_first: string; c_last: string; p_first: string; p_last: string; p_business: string | null
  fb_rating: number | null; fb_comment: string | null; fb_at: unknown
  paid: string; paid_at: unknown; method: string | null; cancelled_at: unknown; completed_at: unknown; refund_requested: boolean
  rf_status: string | null; rf_amount: string | null; rf_method: string | null; rf_account: string | null; rf_remarks: string | null; rf_reference: string | null
  rf_requested_at: unknown; rf_decided_at: unknown; approved_cancel: boolean
}

// One query per call; the actor decides which rows are visible (design: compatibility projection).
async function rows(kind: "all" | "client" | "provider" | "id", value = "") {
  return currentTx()<Row[]>`select b.booking_id::text as id, cu.email as client_email, pu.email as provider_email, b.package_id::text as package_id, b.package_name, b.package_price,
      b.transportation_fee, b.total_amount, b.event_date as start_date, b.event_date + b.duration_days as end_date, trim(to_char(b.event_time, 'FMHH12:MI AM') || coalesce(' – ' || to_char(b.end_time, 'FMHH12:MI AM'), '')) as event_time, b.event_type,
      b.location, b.event_town, b.guests, b.notes, sp.image, b.status, b.cancelled_by,
      cu.first_name as c_first, cu.last_name as c_last, pu.first_name as p_first, pu.last_name as p_last, pu.business_name as p_business,
      f.rating as fb_rating, f.comment as fb_comment, f.created_at as fb_at,
      coalesce(p.paid, 0) as paid, p.paid_at, p.method,
      (select max(a.created_at) from soundstage.audit_log a where a.table_name = 'bookings' and a.record_id = b.booking_id::text and a.new_value = 'cancelled') as cancelled_at,
      (select max(a.created_at) from soundstage.audit_log a where a.table_name = 'bookings' and a.record_id = b.booking_id::text and a.new_value = 'completed') as completed_at,
      exists (select 1 from soundstage.refunds r where r.booking_id = b.booking_id) as refund_requested,
      rf.status as rf_status, rf.amount as rf_amount, rf.payout_method as rf_method, rf.payout_account as rf_account, rf.remarks as rf_remarks,
      rf.reference_number as rf_reference, rf.requested_at as rf_requested_at, coalesce(rf.completed_at, rf.decided_at) as rf_decided_at,
      (b.request_type = 'cancellation' and b.request_status = 'approved') as approved_cancel
    from soundstage.bookings b
    join soundstage.users cu on cu.user_id = b.client_id
    join soundstage.users pu on pu.user_id = b.provider_id
    join soundstage.service_packages sp on sp.package_id = b.package_id
    left join soundstage.feedback f on f.booking_id = b.booking_id
    -- Money received, including payments later refunded, so a refunded booking still shows what was paid.
    left join lateral (select sum(amount) as paid, max(paid_at) as paid_at, max(payment_method) as method from soundstage.payments
      where booking_id = b.booking_id and payment_status in ('paid', 'partially_refunded', 'refunded')) p on true
    left join lateral (select * from soundstage.refunds where booking_id = b.booking_id order by refund_id desc limit 1) rf on true
    where (${kind} = 'all' or (${kind} = 'client' and cu.email = ${value}) or (${kind} = 'provider' and pu.email = ${value}) or (${kind} = 'id' and b.booking_id::text = ${value}))
    order by b.event_date desc, b.booking_id`
}

function toBooking(row: Row): Booking {
  const person = (first: string, last: string, email: string) => `${first || ""} ${last || ""}`.trim() || email
  const start = dateText(row.start_date)
  const price = Number(row.package_price)
  const total = Number(row.total_amount)
  const fee = Number(row.transportation_fee || 0)
  const paid = Number(row.paid)
  const feedback = row.fb_rating === null ? null : { rating: Number(row.fb_rating), comment: row.fb_comment || "", createdAt: iso(row.fb_at) || "" }
  let refund: Booking["refund"]
  if (row.rf_status) {
    const decided = row.rf_status === "completed" ? "Paid" : row.rf_status === "rejected" ? "Rejected" : "Pending"
    refund = { status: decided, amount: Number(row.rf_amount), method: row.rf_method || "", account: row.rf_account || "", requestedAt: iso(row.rf_requested_at) || "",
      ...(decided !== "Pending" ? { processedAt: iso(row.rf_decided_at), ...(decided === "Paid" ? { reference: row.rf_reference || "" } : { reason: row.rf_remarks || "" }) } : {}) }
  }
  return {
    id: row.id, packageId: row.package_id, packageName: row.package_name, provider: row.p_business || person(row.p_first, row.p_last, row.provider_email),
    client: person(row.c_first, row.c_last, row.client_email), image: row.image || "", date: start, time: row.event_time || "", ...(row.event_type ? { eventType: row.event_type } : {}),
    location: row.location || "", guests: row.guests ?? 0, notes: row.notes || "", durationDays: Math.round((Date.parse(dateText(row.end_date)) - Date.parse(start)) / DAY),
    basePrice: total - fee || price, transportationFee: fee, eventTown: row.event_town || "",
    total, downpayment: downpaymentFor(total), status: row.status as Booking["status"], paid: paid >= downpaymentFor(total) && paid > 0,
    ...(row.paid_at ? { paidAt: iso(row.paid_at) } : {}), ...(row.completed_at ? { completedAt: iso(row.completed_at) } : {}),
    ...(row.cancelled_by ? { cancelledBy: (row.cancelled_by === "system" ? "client" : row.cancelled_by) as Booking["cancelledBy"] } : {}),
    ...(row.cancelled_at ? { cancelledAt: iso(row.cancelled_at) } : {}), ...(refund ? { refund } : {}),
    // Mirrors core "refundable": verified money, provider-side cancellation, no earlier request.
    ...(row.status === "cancelled" && paid > 0 && !row.refund_requested && (row.cancelled_by === "provider" || row.approved_cancel) ? { refundEligible: true } : {}), ...(feedback ? { feedback } : {}),
    ...(row.method ? { paymentMethod: row.method } : {}),
  }
}

export type Viewer = { email: string; role: string } | null
// Clients see their own, providers their own, admin and payroll master everything.
export async function listVisible(viewer: Viewer) {
  if (!viewer) return []
  const email = viewer.email.toLowerCase()
  const kind = viewer.role === "admin" || viewer.role === "payroll_master" ? "all" : viewer.role === "client" || viewer.role === "provider" ? viewer.role : null
  if (!kind) return []
  return (await rows(kind, email)).map(row => ({ clientEmail: row.client_email, booking: toBooking(row) }))
}

// Public ratings read completed rows only and expose nothing beyond what buildServiceRatings keeps.
export async function completedWithFeedback() {
  return (await rows("all")).filter(r => r.status === "completed" && r.fb_rating !== null).map(toBooking)
}

// Admin and payroll master may read any booking; others only their own (missing and not-owned look the same).
export async function getOwned(actor: Actor, id: unknown) {
  if (!isBookingId(id)) throw new RequestError("Booking not found.", 404)
  if (actor.role !== "admin" && actor.role !== "payroll_master") await lockOwned(id, actor)
  const [found] = await rows("id", id)
  if (!found) throw new RequestError("Booking not found.", 404)
  return toBooking(found)
}

export async function submitFeedback(actor: Actor, id: unknown, rating: unknown, comment: unknown) {
  if (actor.role !== "client") throw new RequestError("You do not have permission for this operation.", 403)
  const row = await lockOwned(id, actor)
  if (row.status !== "completed") throw new RequestError("Feedback is available only for your completed events.")
  if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5 || typeof comment !== "string" || !comment.trim() || comment.trim().length > 2000) throw new RequestError("Choose 1–5 stars and enter feedback up to 2,000 characters.")
  const feedback = { rating, comment: comment.trim(), createdAt: new Date().toISOString() }
  // One review per booking, enforced by the unique booking_id (Table 8).
  const inserted = await currentTx()<{ feedback_id: string }[]>`insert into soundstage.feedback (booking_id, client_id, provider_id, rating, comment, created_at)
    values (${row.id}, ${row.client_id}, ${row.provider_id}, ${rating as number}, ${feedback.comment}, ${feedback.createdAt}) on conflict (booking_id) do nothing returning feedback_id`
  if (!inserted.length) throw new RequestError("Feedback has already been submitted for this event.")
  return feedback
}

// A refund request covers the verified amount paid (Table 11).
export async function requestRefund(actor: Actor, id: unknown, method: unknown, account: unknown) {
  if (typeof method !== "string" || !REFUND_METHODS.includes(method) || typeof account !== "string" || account.trim().length < 6 || account.length > 200) throw new RequestError("Enter a valid payout method and account details.")
  const result = await transition(id, "refund_pending", actor, "Refund requested")
  const row = await lockOwned(id, { id: "system", email: "", role: "system" })
  const amount = await paidTotal(row.id)
  await currentTx()`insert into soundstage.refunds (booking_id, client_id, amount, reason, payout_method, payout_account)
    values (${row.id}, ${row.client_id}, ${amount}, 'Event cancelled by the provider', ${method}, ${account.trim()})`
  return result
}

// The payroll master marks a refund Paid (with the payout reference) or Rejected (with remarks).
export async function reviewRefund(actor: Actor, id: unknown, status: unknown, details: unknown) {
  if (actor.role !== "payroll_master") throw new RequestError("You do not have permission for this operation.", 403)
  if ((status !== "Paid" && status !== "Rejected") || typeof details !== "string" || details.trim().length < 3 || details.length > 200) throw new RequestError("Enter a payout reference or rejection reason (3–200 characters).")
  if (!isBookingId(id)) throw new RequestError("Booking not found.", 404)
  const tx = currentTx(), note = details.trim()
  if (status === "Paid" && note.length > 100) throw new RequestError("Enter a payout reference of up to 100 characters.")
  const [refund] = await tx<{ refund_id: string; amount: string }[]>`select refund_id, amount from soundstage.refunds where booking_id = ${id} and status in ('requested', 'approved') for update`
  const system: Actor = { id: "system", email: "", role: "system" }
  let result
  try { result = await transition(id, status === "Paid" ? "refunded" : "cancelled", system, note) }
  catch (error) {
    if (error instanceof RequestError && error.status === 409) throw new RequestError("This refund is no longer pending.", 409)
    throw error
  }
  if (!refund) throw new RequestError("This refund is no longer pending.", 409)
  const decidedBy = await userIdByEmail(tx, actor.email)
  if (status === "Rejected") {
    await tx`update soundstage.refunds set status = 'rejected', remarks = ${note}, decided_by = ${decidedBy}, decided_at = now() where refund_id = ${refund.refund_id}`
    await audit(actor, "Refund rejected", "refunds", String(refund.refund_id), "requested", "rejected", note)
    return result
  }
  // Allocate newest payment first; each payment becomes partially or fully refunded.
  let remaining = Math.round(Number(refund.amount) * 100)
  const payments = await tx<{ payment_id: string; amount: string; refunded_amount: string }[]>`select payment_id, amount, refunded_amount from soundstage.payments
    where booking_id = ${id} and payment_status in ('paid', 'partially_refunded') order by paid_at desc nulls last, payment_id desc for update`
  for (const p of payments) {
    if (remaining <= 0) break
    const open = Math.round(Number(p.amount) * 100) - Math.round(Number(p.refunded_amount) * 100), take = Math.min(open, remaining)
    if (take <= 0) continue
    remaining -= take
    await tx`update soundstage.payments set refunded_amount = refunded_amount + ${take / 100},
      payment_status = case when refunded_amount + ${take / 100} >= amount then 'refunded' else 'partially_refunded' end, updated_at = now() where payment_id = ${p.payment_id}`
  }
  await tx`update soundstage.refunds set status = 'completed', reference_number = ${note}, decided_by = ${decidedBy}, decided_at = now(), completed_at = now() where refund_id = ${refund.refund_id}`
  await audit(actor, "Refund completed", "refunds", String(refund.refund_id), "requested", "completed", note)
  return result
}

export async function completedEarnings(providerEmail: string) {
  const [row] = await currentTx()<{ total: string | null }[]>`select coalesce(sum(p.amount), 0) as total from soundstage.payments p
    join soundstage.bookings b on b.booking_id = p.booking_id join soundstage.users u on u.user_id = b.provider_id
    where u.email = ${providerEmail.toLowerCase()} and b.status = 'completed' and p.payment_status in ('paid', 'partially_refunded') and coalesce(p.payment_method, '') not like 'DEMO:%'`
  return Number(row?.total || 0)
}

export { paidTotal }
