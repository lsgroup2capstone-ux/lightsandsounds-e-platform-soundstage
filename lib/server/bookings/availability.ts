import { currentTx } from "../runtime"
import { RequestError } from "../request-error"
import { requireUserId, userIdByEmail } from "../db/users"
import { dayUnavailable, scheduleFor } from "./core"
import type { Actor } from "./rules"

// Provider availability lives in soundstage.schedules (data dictionary Table 6).
const DAY = 86400000
const MAX_RANGE_DAYS = 400
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const addDays = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10)

async function providerId(actor: Actor) {
  if (actor.role !== "provider") throw new RequestError("You do not have permission for this operation.", 403)
  return requireUserId(currentTx(), actor.email)
}

export function validDate(value: unknown) {
  if (typeof value !== "string" || !isoDate.test(value) || addDays(value, 0) !== value) throw new RequestError("Invalid event date.")
  return value
}

// Listed weekdays are working days; an empty list means every day works.
export async function setWeeklyDays(actor: Actor, weekdays: unknown) {
  const id = await providerId(actor)
  if (!Array.isArray(weekdays) || weekdays.some(d => typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6)) throw new RequestError("Weekdays must be whole numbers from 0 to 6.")
  const days = [...new Set(weekdays as number[])].sort()
  const tx = currentTx()
  await tx`delete from soundstage.schedules where provider_id = ${id} and weekday is not null`
  for (const weekday of days) await tx`insert into soundstage.schedules (provider_id, weekday, is_available) values (${id}, ${weekday}, true)`
  return days
}

export async function toggleBlockedDate(actor: Actor, date: unknown) {
  const id = await providerId(actor)
  const day = validDate(date)
  const tx = currentTx()
  const removed = await tx<{ schedule_id: string }[]>`delete from soundstage.schedules where provider_id = ${id} and available_date = ${day}::date and not is_available returning schedule_id`
  if (removed.length) return { date: day, blocked: false }
  await tx`insert into soundstage.schedules (provider_id, available_date, is_available) values (${id}, ${day}::date, false)
    on conflict (provider_id, available_date) do update set is_available = false`
  return { date: day, blocked: true }
}

// Dates in [fromDate, toDate) a client cannot book: blocked, non-working, or held by a blocking booking.
export async function unavailableDates(providerEmail: string, fromDate: string, toDate: string) {
  // Bounded range so a bad request cannot loop for long (review-3 M1).
  if (validDate(fromDate) >= validDate(toDate) || Date.parse(toDate) - Date.parse(fromDate) > MAX_RANGE_DAYS * DAY) throw new RequestError("Choose a date range of up to 400 days.")
  const tx = currentTx()
  const id = await userIdByEmail(tx, providerEmail)
  if (id === null) return []
  const schedule = await scheduleFor(id)
  const bookings = await tx<{ start_date: unknown; end_date: unknown }[]>`select event_date as start_date, event_date + duration_days as end_date from soundstage.bookings
    where provider_id = ${id} and daterange(event_date, event_date + duration_days) && daterange(${fromDate}::date, ${toDate}::date)
      and (status in ('confirmed', 'in_progress') or (status = 'awaiting_payment' and hold_expires_at > now()))`
  const taken = new Set<string>()
  for (const b of bookings) for (let d = dateText(b.start_date); d < dateText(b.end_date); d = addDays(d, 1)) taken.add(d)
  const result: string[] = []
  for (let d = fromDate; d < toDate; d = addDays(d, 1)) if (taken.has(d) || dayUnavailable(schedule, d)) result.push(d)
  return result
}
