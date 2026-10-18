import { currentTx, storage } from "../runtime"
import { RequestError } from "../request-error"
import { isAreaCovered, getTownDistance, getTransportationFee } from "../../booking/booking-pricing"
import { requireUserId, userIdByEmail } from "../db/users"
import { findRule, verb, type Actor } from "./rules"

const SERVICE_PREFIX = "soundstage-provider-services-v2:"
const ACCOUNTS_KEY = "soundstage-accounts-v2"
const HOLD_HOURS = 48
const DOWNPAYMENT = 0.3
// The one downpayment amount: what checkout charges is exactly what confirms (whole pesos).
export const downpaymentFor = (total: number) => Math.round(DOWNPAYMENT * total)
const DAY = 86400000

// Booking row with the people resolved to emails, so ownership checks read the same as before.
export type Row = { id: string; client_email: string; provider_email: string; client_id: string; provider_id: string; status: string; start_date: string; end_date: string; package_price: string; price: string }
export type BookableReason = "past" | "blocked" | "unavailable_day" | "overlap"
export type BookingInput = { packageId: unknown; date: unknown; durationDays?: unknown; time?: unknown; eventType?: unknown; location?: unknown; eventTown?: unknown; guests?: unknown; notes?: unknown }

// Payments register the real sum of verified payments; until then nothing counts as paid.
let paidTotalFn: (bookingId: string) => Promise<number> = async () => 0
export function registerPaidTotal(fn: (bookingId: string) => Promise<number>) { paidTotalFn = fn }
export const paidTotal = (bookingId: string) => paidTotalFn(bookingId)

const reasons: Record<BookableReason, string> = {
  past: "Choose a date from today onward.",
  blocked: "This provider has blocked a selected date.",
  unavailable_day: "This provider does not work on a selected day.",
  overlap: "These dates are already booked",
}
const SYSTEM: Actor = { id: "system", email: "", role: "system" }
export const isBookingId = (value: unknown): value is string => typeof value === "string" && /^\d{1,18}$/.test(value)
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const addDays = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10)
export const manilaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())

function text(value: unknown, max: number, required = true) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (required) throw new RequestError("A required text field is invalid.")
    return null
  }
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new RequestError("A required text field is invalid.")
  return value.trim()
}

// One time of day: "18:00", "6:00 PM", "6pm".
function timeOfDay(raw: string) {
  const match = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])\.?\s*m?\.?$/i.exec(raw.trim()) || /^(\d{1,2}):(\d{2})(?::\d{2})?()$/.exec(raw.trim())
  if (!match) throw new RequestError("Enter the event time like 6:00 PM or 6:00 PM – 11:00 PM.")
  let hours = Number(match[1])
  const minutes = Number(match[2] || 0), period = match[3]?.toLowerCase()
  if (period) { if (hours < 1 || hours > 12) throw new RequestError("Invalid event time."); hours = hours % 12 + (period === "p" ? 12 : 0) }
  if (hours > 23 || minutes > 59) throw new RequestError("Invalid event time.")
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}
// The booking form sends a start time and an optional end time ("6:00 PM – 11:00 PM").
function eventTimes(value: unknown): [string | null, string | null] {
  const raw = text(value, 64, false)
  if (!raw) return [null, null]
  const [start, end, extra] = raw.split(/\s*(?:–|—|-|to)\s*/i)
  if (extra !== undefined || !start) throw new RequestError("Enter the event time like 6:00 PM or 6:00 PM – 11:00 PM.")
  return [timeOfDay(start), end ? timeOfDay(end) : null]
}

// Weekday rows are working days (none means every day); dated rows block a day or open it.
export async function scheduleFor(providerId: number | string) {
  const rows = await currentTx()<{ available_date: unknown; weekday: number | null; is_available: boolean }[]>`select available_date, weekday, is_available from soundstage.schedules where provider_id = ${providerId}`
  return {
    blocked: new Set(rows.filter(r => r.available_date && !r.is_available).map(r => dateText(r.available_date))),
    opened: new Set(rows.filter(r => r.available_date && r.is_available).map(r => dateText(r.available_date))),
    weekly: new Set(rows.filter(r => r.weekday !== null && r.is_available).map(r => Number(r.weekday))),
  }
}
export function dayUnavailable(schedule: Awaited<ReturnType<typeof scheduleFor>>, day: string): BookableReason | null {
  if (schedule.blocked.has(day)) return "blocked"
  if (schedule.weekly.size && !schedule.opened.has(day) && !schedule.weekly.has(new Date(day + "T00:00:00Z").getUTCDay())) return "unavailable_day"
  return null
}

export async function isBookable(providerEmail: string, start: string, endExclusive: string, excludeId?: string): Promise<{ ok: true } | { ok: false; reason: BookableReason }> {
  const tx = currentTx()
  if (start < manilaToday()) return { ok: false, reason: "past" }
  const providerId = await userIdByEmail(tx, providerEmail)
  if (providerId === null) return { ok: false, reason: "unavailable_day" }
  const schedule = await scheduleFor(providerId)
  for (let day = start; day < endExclusive; day = addDays(day, 1)) {
    const reason = dayUnavailable(schedule, day)
    if (reason) return { ok: false, reason }
  }
  const overlap = await tx<{ booking_id: string }[]>`select booking_id from soundstage.bookings
    where provider_id = ${providerId} and booking_id::text <> ${excludeId || ""}
      and daterange(event_date, event_date + duration_days) && daterange(${start}::date, ${endExclusive}::date)
      and (status in ('confirmed', 'in_progress') or (status = 'awaiting_payment' and hold_expires_at > now()))
    limit 1`
  return overlap.length ? { ok: false, reason: "overlap" } : { ok: true }
}

export async function assertBookable(providerEmail: string, start: string, end: string, excludeId?: string) {
  const result = await isBookable(providerEmail, start, end, excludeId)
  if (!result.ok) throw new RequestError(reasons[result.reason])
}

function findService(packageId: unknown) {
  for (const [key, raw] of Object.entries(storage.values)) {
    if (!key.startsWith(SERVICE_PREFIX)) continue
    const service = (JSON.parse(raw) as Record<string, unknown>[]).find(s => s.id === packageId)
    // Ownership follows the stored package's provider, never a caller-supplied name.
    if (service) return { service, ownerEmail: decodeURIComponent(key.slice(SERVICE_PREFIX.length)).toLowerCase() }
  }
  return null
}

// Every status change is an append-only audit_log row (data dictionary Table 13).
export async function audit(actor: Actor, action: string, table: string, recordId: string, oldValue: string | null, newValue: string | null, reason: string | null) {
  const tx = currentTx()
  const userId = actor.role === "system" || !actor.email ? null : await userIdByEmail(tx, actor.email)
  await tx`insert into soundstage.audit_log (user_id, actor_role, action, table_name, record_id, old_value, new_value, reason)
    values (${userId}, ${actor.role}, ${action}, ${table}, ${recordId}, ${oldValue}, ${newValue}, ${reason})`
}
const history = (bookingId: string, from: string | null, to: string, actor: Actor, reason: string | null) => audit(actor, "Booking status changed", "bookings", bookingId, from, to, reason)

export async function createBooking(actor: Actor, input: BookingInput, idempotencyKey: string) {
  if (actor.role !== "client") throw new RequestError("You do not have permission for this operation.", 403)
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 100) throw new RequestError("A request key is required.")
  const tx = currentTx()
  const clientId = await requireUserId(tx, actor.email)
  const [existing] = await tx<{ booking_id: string; client_id: string }[]>`select booking_id, client_id from soundstage.bookings where idempotency_key = ${idempotencyKey}`
  if (existing) {
    if (Number(existing.client_id) !== clientId) throw new RequestError("This request key is already used.")
    return { id: String(existing.booking_id) }
  }
  const found = findService(input.packageId)
  if (!found || found.service.active !== true) throw new RequestError("Service is no longer available.")
  const { service, ownerEmail } = found
  const accounts = JSON.parse(storage.getItem(ACCOUNTS_KEY) || "[]") as { role: string; email: string; application?: { status?: string } }[]
  if (!accounts.some(a => a.role === "provider" && a.email.toLowerCase() === ownerEmail && a.application?.status === "Approved")) throw new RequestError("This provider is not accepting bookings.")
  const date = text(input.date, 10)!
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || addDays(date, 0) !== date) throw new RequestError("Invalid event date.")
  const duration = input.durationDays === undefined ? 1 : input.durationDays
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > 30) throw new RequestError("Use whole numbers for days.")
  const guests = input.guests === undefined ? null : input.guests
  if (guests !== null && (typeof guests !== "number" || !Number.isInteger(guests) || guests < 0 || guests > 100000)) throw new RequestError("Invalid amount or quantity.")
  const eventTown = text(input.eventTown, 100)!
  const end = addDays(date, duration)
  await expireHolds()
  await assertBookable(ownerEmail, date, end)
  const providerId = await requireUserId(tx, ownerEmail)
  // Server-computed price; client-supplied amounts are never read.
  const price = Number(service.price)
  const areas = String(service.coverageAreas || service.location || "")
  const transportationFee = isAreaCovered(eventTown, areas) ? 0 : getTransportationFee(eventTown, getTownDistance(areas, eventTown))
  const base = Math.round(price * (1 + .38 * (duration - 1)))
  const [startTime, endTime] = eventTimes(input.time)
  const [row] = await tx<{ booking_id: string }[]>`insert into soundstage.bookings
    (idempotency_key, client_id, provider_id, package_id, event_date, duration_days, event_time, end_time, location, event_town, event_type, guests, notes,
     package_name, package_price, transportation_fee, total_amount, status)
    values (${idempotencyKey}, ${clientId}, ${providerId}, ${String(service.id)}, ${date}::date, ${duration}, ${startTime}::time, ${endTime}::time, ${text(input.location, 150, false)}, ${eventTown},
     ${text(input.eventType, 100, false)}, ${guests}, ${String(input.notes || "").slice(0, 5000)}, ${String(service.name).slice(0, 100)}, ${price}, ${transportationFee}, ${base + transportationFee}, 'pending')
    returning booking_id`
  const id = String(row.booking_id)
  await history(id, null, "pending", actor, null)
  return { id }
}

// Missing and not-owned look identical so nothing about the booking leaks (AC13).
export async function lockOwned(id: unknown, actor: Actor): Promise<Row> {
  if (!isBookingId(id)) throw new RequestError("Booking not found.", 404)
  const [row] = await currentTx()<Row[]>`select b.booking_id::text as id, cu.email as client_email, pu.email as provider_email, b.client_id, b.provider_id, b.status,
      b.event_date as start_date, b.event_date + b.duration_days as end_date, b.package_price, b.total_amount as price
    from soundstage.bookings b join soundstage.users cu on cu.user_id = b.client_id join soundstage.users pu on pu.user_id = b.provider_id
    where b.booking_id = ${id} for update of b`
  const email = actor.email.toLowerCase()
  const owns = row && (actor.role === "system" || (actor.role === "client" && row.client_email === email) || (actor.role === "provider" && row.provider_email === email))
  if (!owns) throw new RequestError("Booking not found.", 404)
  return { ...row, start_date: dateText(row.start_date), end_date: dateText(row.end_date) }
}

async function apply(row: Row, to: string, actor: Actor, reason: string | null, startHold = false): Promise<Row> {
  const tx = currentTx()
  const cancelling = to === "cancelled" && row.status !== "refund_pending"
  let updated: { booking_id: string }[]
  try {
    updated = startHold
      ? await tx`update soundstage.bookings set status = ${to}, hold_expires_at = now() + make_interval(hours => ${HOLD_HOURS}), updated_at = now() where booking_id = ${row.id} and status = ${row.status} returning booking_id`
      : await tx`update soundstage.bookings set status = ${to}, cancelled_by = coalesce(${cancelling ? actor.role : null}::text, cancelled_by),
          cancel_reason = coalesce(${cancelling ? reason : null}::text, cancel_reason), updated_at = now()
          where booking_id = ${row.id} and status = ${row.status} returning booking_id`
  } catch (error) {
    if ((error as { code?: string }).code === "23P01") throw new RequestError("These dates are already booked", 409)
    throw error
  }
  // Zero rows: another request changed the status first (AC14).
  if (!updated.length) throw new RequestError(`Cannot ${verb(to)} a booking that is ${row.status}`, 409)
  await history(row.id, row.status, to, actor, reason)
  return { ...row, status: to }
}

export async function transition(id: unknown, to: string, actor: Actor, reason?: string) {
  const row = await lockOwned(id, actor)
  const rule = findRule(row.status, to, actor.role)
  if (!rule) throw new RequestError(`Cannot ${verb(to)} a booking that is ${row.status}`, 409)
  const why = text(reason, 1000, false)
  for (const check of rule.checks) {
    if (check === "reason" && !why) throw new RequestError("A reason is required.")
    if (check === "started" && row.start_date > manilaToday()) throw new RequestError("This can only happen on or after the event start date.")
    if (check === "unpaid" && (await paidTotalFn(row.id)) > 0) throw new RequestError("This booking is paid. Submit a cancellation request instead.")
    // Confirmation needs the verified downpayment no matter who calls (D6, AC16).
    if (check === "downpayment" && (await paidTotalFn(row.id)) < downpaymentFor(Number(row.price))) throw new RequestError("The downpayment has not been verified.", 409)
    // Refunds need verified money and a provider-side cancellation, and only one request (spec table).
    if (check === "refundable") {
      const [info] = await currentTx()<{ cancelled_by: string | null; approved: boolean; requested: boolean }[]>`select b.cancelled_by,
        (b.request_type = 'cancellation' and b.request_status = 'approved') as approved,
        exists (select 1 from soundstage.refunds r where r.booking_id = b.booking_id) as requested
        from soundstage.bookings b where b.booking_id = ${row.id}`
      if ((await paidTotalFn(row.id)) <= 0 || !(info.cancelled_by === "provider" || info.approved)) throw new RequestError("Only paid events cancelled by the provider qualify for a refund.")
      if (info.requested) throw new RequestError("A refund request already exists for this event.")
    }
    if (check === "available") {
      await expireHolds()
      await assertBookable(row.provider_email, row.start_date, row.end_date, row.id)
    }
  }
  let next = await apply(row, to, actor, why)
  if (to === "accepted") {
    next = await apply(next, "awaiting_payment", SYSTEM, null, true)
    // Money already received may cover the downpayment.
    if ((await paidTotalFn(row.id)) >= downpaymentFor(Number(row.price)) && (await confirmFromPayment(row.id)).confirmed) next = { ...next, status: "confirmed" }
  }
  return { id: next.id, status: next.status }
}

export async function expireHolds() {
  const expired = await currentTx()<{ booking_id: string }[]>`select booking_id from soundstage.bookings where status = 'awaiting_payment' and hold_expires_at <= now() order by booking_id for update`
  for (const { booking_id } of expired) await transition(String(booking_id), "cancelled", SYSTEM, "payment expired")
  return expired.length
}

// Called only by the verified payment path; never a browser action (AC18).
export async function confirmFromPayment(bookingId: string): Promise<{ confirmed: true } | { confirmed: false; reason: "hold_expired" | "not_awaiting_payment" | "dates_taken" | "insufficient" }> {
  await expireHolds()
  const row = await lockOwned(bookingId, SYSTEM)
  if (row.status !== "awaiting_payment") {
    // The hold may have expired in this request or an earlier one; the audit log says which.
    const [last] = await currentTx()<{ reason: string | null }[]>`select reason from soundstage.audit_log where table_name = 'bookings' and record_id = ${row.id} order by audit_id desc limit 1`
    return { confirmed: false, reason: row.status === "cancelled" && last?.reason === "payment expired" ? "hold_expired" : "not_awaiting_payment" }
  }
  if ((await paidTotalFn(row.id)) < downpaymentFor(Number(row.price))) return { confirmed: false, reason: "insufficient" }
  const overlap = await currentTx()<{ booking_id: string }[]>`select booking_id from soundstage.bookings where provider_id = ${row.provider_id} and booking_id <> ${row.id}
    and status in ('confirmed', 'in_progress') and daterange(event_date, event_date + duration_days) && daterange(${row.start_date}::date, ${row.end_date}::date) limit 1`
  if (overlap.length) return { confirmed: false, reason: "dates_taken" }
  await apply(row, "confirmed", SYSTEM, null)
  return { confirmed: true }
}
