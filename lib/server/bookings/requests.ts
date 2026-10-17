import { currentTx } from "../runtime"
import { RequestError } from "../request-error"
import { assertBookable, expireHolds, lockOwned, paidTotal, transition } from "./core"
import { validDate } from "./availability"
import { verb, type Actor } from "./rules"

const DAY = 86400000
const RESCHEDULABLE = ["accepted", "awaiting_payment", "confirmed"]
const UNPAID_CANCELLABLE = ["pending", "accepted", "awaiting_payment"]
const addDays = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10)
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

async function insertRequest(kind: Kind, insert: () => Promise<{ id: string }[]>) {
  try {
    const [row] = await insert()
    return { id: row.id, status: "pending" as const }
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new RequestError(`A ${kind} request is already pending`, 409)
    throw error
  }
}

export async function requestReschedule(actor: Actor, bookingId: unknown, newStart: unknown, durationDays: unknown, reason?: unknown) {
  clientOnly(actor)
  const booking = await lockOwned(bookingId, actor)
  if (!RESCHEDULABLE.includes(booking.status)) throw new RequestError(`Cannot reschedule a booking that is ${booking.status}`, 409)
  const start = validDate(newStart)
  if (typeof durationDays !== "number" || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) throw new RequestError("Use whole numbers for days.")
  const end = addDays(start, durationDays)
  const why = reasonText(reason, false)
  await expireHolds()
  await assertBookable(booking.provider_email, start, end, booking.id)
  return insertRequest("reschedule", () => currentTx()<{ id: string }[]>`insert into soundstage.reschedule_requests (booking_id, new_start_date, new_end_date, requested_by, reason)
    values (${booking.id}, ${start}::date, ${end}::date, ${actor.id}, ${why}) returning id`)
}

// Locks the pending request for its booking's provider; missing and not-owned look the same (AC13).
async function lockRequest(kind: Kind, requestId: unknown, actor: Actor) {
  if (actor.role !== "provider") throw new RequestError("You do not have permission for this operation.", 403)
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new RequestError("Request not found.", 404)
  const tx = currentTx()
  const rows = kind === "reschedule"
    ? await tx<{ booking_id: string; status: string }[]>`select booking_id, status from soundstage.reschedule_requests where id = ${requestId} for update`
    : await tx<{ booking_id: string; status: string }[]>`select booking_id, status from soundstage.cancellation_requests where id = ${requestId} for update`
  if (!rows.length) throw new RequestError("Request not found.", 404)
  try { await lockOwned(rows[0].booking_id, actor) } catch { throw new RequestError("Request not found.", 404) }
  return rows[0].booking_id
}

// The status precondition makes every decision single-use (AC24).
async function decide(kind: Kind, requestId: string, actor: Actor, approve: boolean) {
  const status = approve ? "approved" : "declined"
  const tx = currentTx()
  const updated = kind === "reschedule"
    ? await tx<{ id: string }[]>`update soundstage.reschedule_requests set status = ${status}, decided_by = ${actor.id}, decided_at = now() where id = ${requestId} and status = 'pending' returning id`
    : await tx<{ id: string }[]>`update soundstage.cancellation_requests set status = ${status}, decided_by = ${actor.id}, decided_at = now() where id = ${requestId} and status = 'pending' returning id`
  if (!updated.length) throw new RequestError("This request was already decided", 409)
}

export async function decideReschedule(actor: Actor, requestId: unknown, approve: unknown) {
  if (typeof approve !== "boolean") throw new RequestError("Choose approve or decline.")
  const bookingId = await lockRequest("reschedule", requestId, actor)
  await decide("reschedule", requestId as string, actor, approve)
  if (!approve) return { id: requestId as string, status: "declined" as const }
  // Re-check in the same transaction; any failure rolls back the decision too (AC22).
  await expireHolds()
  const booking = await lockOwned(bookingId, actor)
  if (!RESCHEDULABLE.includes(booking.status)) throw new RequestError(`Cannot reschedule a booking that is ${booking.status}`, 409)
  const [request] = await currentTx()<{ new_start_date: unknown; new_end_date: unknown }[]>`select new_start_date, new_end_date from soundstage.reschedule_requests where id = ${requestId as string}`
  const date = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)
  const start = date(request.new_start_date), end = date(request.new_end_date)
  await assertBookable(booking.provider_email, start, end, booking.id)
  try {
    await currentTx()`update soundstage.bookings set start_date = ${start}::date, end_date = ${end}::date, updated_at = now() where id = ${booking.id} and status = ${booking.status}`
  } catch (error) {
    if ((error as { code?: string }).code === "23P01") throw new RequestError("These dates are already booked", 409)
    throw error
  }
  return { id: requestId as string, status: "approved" as const }
}

export async function requestCancellation(actor: Actor, bookingId: unknown, reason?: unknown) {
  clientOnly(actor)
  const booking = await lockOwned(bookingId, actor)
  const why = reasonText(reason, false)
  const paid = await paidTotal(booking.id)
  if (UNPAID_CANCELLABLE.includes(booking.status) && paid === 0) return transition(booking.id, "cancelled", actor, why ?? undefined)
  if (booking.status !== "confirmed" || paid === 0) throw new RequestError(`Cannot ${verb("cancelled")} a booking that is ${booking.status}`, 409)
  return insertRequest("cancellation", () => currentTx()<{ id: string }[]>`insert into soundstage.cancellation_requests (booking_id, requested_by, reason)
    values (${booking.id}, ${actor.id}, ${why}) returning id`)
}

export async function decideCancellation(actor: Actor, requestId: unknown, approve: unknown) {
  if (typeof approve !== "boolean") throw new RequestError("Choose approve or decline.")
  const bookingId = await lockRequest("cancellation", requestId, actor)
  await decide("cancellation", requestId as string, actor, approve)
  if (!approve) return { id: requestId as string, status: "declined" as const }
  await transition(bookingId, "cancelled", { id: "system", email: "", role: "system" }, "cancellation approved by provider")
  await currentTx()`update soundstage.bookings set cancelled_by = 'client' where id = ${bookingId}`
  return { id: requestId as string, status: "approved" as const }
}
