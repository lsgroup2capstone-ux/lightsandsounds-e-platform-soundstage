import { currentTx, storage } from "../runtime"
import { RequestError } from "../request-error"
import { isAreaCovered, getTownDistance, getTransportationFee } from "../../booking/booking-pricing"
import { findRule, verb, type Actor } from "./rules"

const SERVICE_PREFIX = "soundstage-provider-services-v2:"
const ACCOUNTS_KEY = "soundstage-accounts-v2"
const HOLD_HOURS = 48
const DOWNPAYMENT = 0.3
// The one downpayment amount: what checkout charges is exactly what confirms (whole pesos).
export const downpaymentFor = (total: number) => Math.round(DOWNPAYMENT * total)
const DAY = 86400000

type Row = { id: string; client_email: string; provider_email: string; status: string; start_date: string; end_date: string; package_price: string; price: string }
export type BookableReason = "past" | "blocked" | "unavailable_day" | "overlap"
export type BookingInput = { packageId: unknown; date: unknown; durationDays?: unknown; time?: unknown; eventType?: unknown; location?: unknown; eventTown?: unknown; guests?: unknown; notes?: unknown }

// Payments plan 1 registers the real sum of verified payments; until then nothing counts as paid.
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

export async function isBookable(providerEmail: string, start: string, endExclusive: string, excludeId?: string): Promise<{ ok: true } | { ok: false; reason: BookableReason }> {
  const tx = currentTx()
  if (start < manilaToday()) return { ok: false, reason: "past" }
  const schedule = await tx<{ kind: string; weekday: number | null; blocked_date: unknown }[]>`select kind, weekday, blocked_date from soundstage.availability_schedules where provider_email = ${providerEmail}`
  const blocked = new Set(schedule.filter(s => s.kind === "blocked").map(s => dateText(s.blocked_date)))
  const weekly = new Set(schedule.filter(s => s.kind === "weekly").map(s => Number(s.weekday)))
  for (let day = start; day < endExclusive; day = addDays(day, 1)) {
    if (blocked.has(day)) return { ok: false, reason: "blocked" }
    // No weekly rows means the provider works every day.
    if (weekly.size && !weekly.has(new Date(day + "T00:00:00Z").getUTCDay())) return { ok: false, reason: "unavailable_day" }
  }
  const overlap = await tx<{ id: string }[]>`select id from soundstage.bookings
    where provider_email = ${providerEmail} and id::text <> ${excludeId || ""}
      and daterange(start_date, end_date) && daterange(${start}::date, ${endExclusive}::date)
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
    // Ownership follows the stored service key, never a caller-supplied name.
    if (service) return { service, ownerEmail: decodeURIComponent(key.slice(SERVICE_PREFIX.length)).toLowerCase() }
  }
  return null
}

export async function createBooking(actor: Actor, input: BookingInput, idempotencyKey: string) {
  if (actor.role !== "client") throw new RequestError("You do not have permission for this operation.", 403)
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 200) throw new RequestError("A request key is required.")
  const tx = currentTx()
  const clientEmail = actor.email.toLowerCase()
  const [existing] = await tx<{ id: string; client_email: string }[]>`select id, client_email from soundstage.bookings where idempotency_key = ${idempotencyKey}`
  if (existing) {
    if (existing.client_email !== clientEmail) throw new RequestError("This request key is already used.")
    return { id: existing.id }
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
  const eventTown = text(input.eventTown, 200)!
  const end = addDays(date, duration)
  await expireHolds()
  await assertBookable(ownerEmail, date, end)
  // Server-computed price; client-supplied amounts are never read.
  const price = Number(service.price)
  const areas = String(service.coverageAreas || service.location || "")
  const transportationFee = isAreaCovered(eventTown, areas) ? 0 : getTransportationFee(eventTown, getTownDistance(areas, eventTown))
  const base = Math.round(price * (1 + .38 * (duration - 1)))
  const inclusions = Array.isArray(service.inclusions) ? service.inclusions : []
  const [row] = await tx<{ id: string }[]>`insert into soundstage.bookings
    (idempotency_key, client_email, provider_email, package_id, package_name, package_inclusions, package_price, base_price, transportation_fee, total,
     start_date, end_date, event_time, event_type, location, event_town, guests, notes, image, status)
    values (${idempotencyKey}, ${clientEmail}, ${ownerEmail}, ${String(service.id)}, ${String(service.name)}, ${JSON.stringify(inclusions)}::jsonb, ${price}, ${base}, ${transportationFee}, ${base + transportationFee},
     ${date}, ${end}, ${text(input.time, 64, false)}, ${text(input.eventType, 100, false)}, ${text(input.location, 500, false)}, ${eventTown}, ${guests}, ${String(input.notes || "").slice(0, 5000)}, ${String(service.image || "")}, 'pending')
    returning id`
  await history(row.id, null, "pending", actor, null)
  return { id: row.id }
}

async function history(bookingId: string, from: string | null, to: string, actor: Actor, reason: string | null) {
  await currentTx()`insert into soundstage.booking_status_history (booking_id, old_status, new_status, actor_id, actor_role, reason)
    values (${bookingId}, ${from}, ${to}, ${actor.role === "system" ? null : actor.id}, ${actor.role}, ${reason})`
}

// Missing and not-owned look identical so nothing about the booking leaks (AC13).
export async function lockOwned(id: unknown, actor: Actor): Promise<Row> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new RequestError("Booking not found.", 404)
  const [row] = await currentTx()<Row[]>`select id, client_email, provider_email, status, start_date, end_date, package_price, coalesce(total, package_price) as price from soundstage.bookings where id = ${id} for update`
  const email = actor.email.toLowerCase()
  const owns = row && (actor.role === "system" || (actor.role === "client" && row.client_email === email) || (actor.role === "provider" && row.provider_email === email))
  if (!owns) throw new RequestError("Booking not found.", 404)
  return { ...row, start_date: dateText(row.start_date), end_date: dateText(row.end_date) }
}

async function apply(row: Row, to: string, actor: Actor, reason: string | null, startHold = false): Promise<Row> {
  const tx = currentTx()
  let updated: { id: string }[]
  try {
    updated = startHold
      ? await tx`update soundstage.bookings set status = ${to}, hold_expires_at = now() + make_interval(hours => ${HOLD_HOURS}), updated_at = now() where id = ${row.id} and status = ${row.status} returning id`
      : await tx`update soundstage.bookings set status = ${to}, cancelled_by = coalesce(${to === "cancelled" && row.status !== "refund_pending" ? actor.role : null}::text, cancelled_by), updated_at = now() where id = ${row.id} and status = ${row.status} returning id`
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
        exists (select 1 from soundstage.cancellation_requests c where c.booking_id = b.id and c.status = 'approved') as approved,
        exists (select 1 from soundstage.booking_status_history h where h.booking_id = b.id and h.new_status = 'refund_pending') as requested
        from soundstage.bookings b where b.id = ${row.id}`
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
    // Legacy money already received may cover the downpayment (design U2).
    if ((await paidTotalFn(row.id)) >= downpaymentFor(Number(row.price)) && (await confirmFromPayment(row.id)).confirmed) next = { ...next, status: "confirmed" }
  }
  return { id: next.id, status: next.status }
}

export async function expireHolds() {
  const expired = await currentTx()<{ id: string }[]>`select id from soundstage.bookings where status = 'awaiting_payment' and hold_expires_at <= now() order by id for update`
  for (const { id } of expired) await transition(id, "cancelled", SYSTEM, "payment expired")
  return expired.length
}

// Called only by the verified payment path; never a browser action (AC18).
export async function confirmFromPayment(bookingId: string): Promise<{ confirmed: true } | { confirmed: false; reason: "hold_expired" | "not_awaiting_payment" | "dates_taken" | "insufficient" }> {
  await expireHolds()
  const row = await lockOwned(bookingId, SYSTEM)
  if (row.status !== "awaiting_payment") {
    // The hold may have expired in this request or an earlier one; history says which.
    const [last] = await currentTx()<{ reason: string | null }[]>`select reason from soundstage.booking_status_history where booking_id = ${row.id} order by id desc limit 1`
    return { confirmed: false, reason: row.status === "cancelled" && last?.reason === "payment expired" ? "hold_expired" : "not_awaiting_payment" }
  }
  if ((await paidTotalFn(row.id)) < downpaymentFor(Number(row.price))) return { confirmed: false, reason: "insufficient" }
  const overlap = await currentTx()<{ id: string }[]>`select id from soundstage.bookings where provider_email = ${row.provider_email} and id <> ${row.id}
    and status in ('confirmed', 'in_progress') and daterange(start_date, end_date) && daterange(${row.start_date}::date, ${row.end_date}::date) limit 1`
  if (overlap.length) return { confirmed: false, reason: "dates_taken" }
  await apply(row, "confirmed", SYSTEM, null)
  return { confirmed: true }
}
