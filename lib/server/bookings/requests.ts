import { currentTx } from "../runtime"
import { RequestError } from "../request-error"
import { assertBookable, audit, expireHolds, isBookingId, lockOwned, paidTotal, transition } from "./core"
import { validDate } from "./availability"
import { verb, type Actor } from "./rules"

// A booking holds at most one pending request (reschedule or cancellation) in its request_* columns.
// The request id the screens use is the booking id.
const DAY = 86400000
const RESCHEDULABLE = ["accepted", "awaiting_payment", "confirmed"]
const UNPAID_CANCELLABLE = ["pending", "accepted", "awaiting_payment"]
const addDays = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10)
const dateText = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)
type Kind = "reschedule" | "cancellation"

function clientOnly(actor: Actor) {
  if (actor.role !== "client") throw new RequestError("You do not have permission for this operation.", 403)
}

function reasonText(value: unknown, required: boolean) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (required) throw new RequestError("A reason is required.")
    return null
  }
  if (typeof value !== "string" || value.length > 1000) throw new RequestError("A required text field is invalid.")
  return value.trim()
}

// Stores the request unless one is already pending on this booking.
async function openRequest(kind: Kind, bookingId: string, actor: Actor, reason: string | null, date: string | null = null, days: number | null = null) {
  const tx = currentTx()
  const updated = await tx<{ booking_id: string }[]>`update soundstage.bookings set request_type = ${kind}, request_status = 'pending', request_reason = ${reason},
      requested_date = ${date}::date, requested_duration_days = ${days}, updated_at = now()
    where booking_id = ${bookingId} and request_status is distinct from 'pending' returning booking_id`
  if (!updated.length) {
    const [pending] = await tx<{ request_type: string }[]>`select request_type from soundstage.bookings where booking_id = ${bookingId}`
    throw new RequestError(`A ${pending?.request_type || kind} request is already pending`, 409)
  }
  await audit(actor, `${kind === "reschedule" ? "Reschedule" : "Cancellation"} requested`, "bookings", bookingId, null, date ? `${date} (${days} day${days === 1 ? "" : "s"})` : null, reason)
  return { id: bookingId, status: "pending" as const }
}

export async function requestReschedule(actor: Actor, bookingId: unknown, newStart: unknown, durationDays: unknown, reason?: unknown) {
  clientOnly(actor)
  const booking = await lockOwned(bookingId, actor)
  if (!RESCHEDULABLE.includes(booking.status)) throw new RequestError(`Cannot reschedule a booking that is ${booking.status}`, 409)
  const start = validDate(newStart)
  if (typeof durationDays !== "number" || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) throw new RequestError("Use whole numbers for days.")
  const why = reasonText(reason, false)
  await expireHolds()
  await assertBookable(booking.provider_email, start, addDays(start, durationDays), booking.id)
  return openRequest("reschedule", booking.id, actor, why, start, durationDays)
}

// Locks the booking for its provider and returns the pending request; missing and not-owned look the same (AC13).
async function lockRequest(kind: Kind, requestId: unknown, actor: Actor) {
  if (actor.role !== "provider") throw new RequestError("You do not have permission for this operation.", 403)
  if (!isBookingId(requestId)) throw new RequestError("Request not found.", 404)
  try { await lockOwned(requestId, actor) } catch { throw new RequestError("Request not found.", 404) }
  const [row] = await currentTx()<{ request_type: string | null; request_status: string | null; requested_date: unknown; requested_duration_days: number | null }[]>`select request_type,
    request_status, requested_date, requested_duration_days from soundstage.bookings where booking_id = ${requestId}`
  if (row?.request_type !== kind) throw new RequestError("Request not found.", 404)
  // The status precondition makes every decision single-use (AC24).
  if (row.request_status !== "pending") throw new RequestError("This request was already decided", 409)
  return row
}

async function decide(kind: Kind, bookingId: string, actor: Actor, approve: boolean) {
  const status = approve ? "approved" : "declined"
  await currentTx()`update soundstage.bookings set request_status = ${status}, updated_at = now() where booking_id = ${bookingId}`
  await audit(actor, `${kind === "reschedule" ? "Reschedule" : "Cancellation"} ${status}`, "bookings", bookingId, "pending", status, null)
}

export async function decideReschedule(actor: Actor, requestId: unknown, approve: unknown) {
  if (typeof approve !== "boolean") throw new RequestError("Choose approve or decline.")
  const request = await lockRequest("reschedule", requestId, actor)
  const bookingId = requestId as string
  await decide("reschedule", bookingId, actor, approve)
  if (!approve) return { id: bookingId, status: "declined" as const }
  // Re-check in the same transaction; any failure rolls back the decision too (AC22).
  await expireHolds()
  const booking = await lockOwned(bookingId, actor)
  if (!RESCHEDULABLE.includes(booking.status)) throw new RequestError(`Cannot reschedule a booking that is ${booking.status}`, 409)
  const start = dateText(request.requested_date), days = Number(request.requested_duration_days || 1)
  await assertBookable(booking.provider_email, start, addDays(start, days), booking.id)
  try {
    await currentTx()`update soundstage.bookings set event_date = ${start}::date, duration_days = ${days}, updated_at = now() where booking_id = ${booking.id} and status = ${booking.status}`
  } catch (error) {
    if ((error as { code?: string }).code === "23P01") throw new RequestError("These dates are already booked", 409)
    throw error
  }
  return { id: bookingId, status: "approved" as const }
}

export async function requestCancellation(actor: Actor, bookingId: unknown, reason?: unknown) {
  clientOnly(actor)
  const booking = await lockOwned(bookingId, actor)
  const why = reasonText(reason, false)
  const paid = await paidTotal(booking.id)
  if (UNPAID_CANCELLABLE.includes(booking.status) && paid === 0) return transition(booking.id, "cancelled", actor, why ?? undefined)
  if (booking.status !== "confirmed" || paid === 0) throw new RequestError(`Cannot ${verb("cancelled")} a booking that is ${booking.status}`, 409)
  return openRequest("cancellation", booking.id, actor, why)
}

export async function decideCancellation(actor: Actor, requestId: unknown, approve: unknown) {
  if (typeof approve !== "boolean") throw new RequestError("Choose approve or decline.")
  await lockRequest("cancellation", requestId, actor)
  const bookingId = requestId as string
  await decide("cancellation", bookingId, actor, approve)
  if (!approve) return { id: bookingId, status: "declined" as const }
  await transition(bookingId, "cancelled", { id: "system", email: "", role: "system" }, "cancellation approved by provider")
  await currentTx()`update soundstage.bookings set cancelled_by = 'client' where booking_id = ${bookingId}`
  return { id: bookingId, status: "approved" as const }
}
