import { currentTx } from "../runtime"
import { RequestError } from "../request-error"
import type { Actor } from "./rules"

const DAY = 86400000
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const addDays = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10)

function providerEmail(actor: Actor) {
  if (actor.role !== "provider") throw new RequestError("You do not have permission for this operation.", 403)
  return actor.email.toLowerCase()
}

export function validDate(value: unknown) {
  if (typeof value !== "string" || !isoDate.test(value) || addDays(value, 0) !== value) throw new RequestError("Invalid event date.")
  return value
}

// Listed weekdays are working days; an empty list means every day works.
export async function setWeeklyDays(actor: Actor, weekdays: unknown) {
  const email = providerEmail(actor)
  if (!Array.isArray(weekdays) || weekdays.some(d => typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6)) throw new RequestError("Weekdays must be whole numbers from 0 to 6.")
  const days = [...new Set(weekdays as number[])].sort()
  const tx = currentTx()
  await tx`delete from soundstage.availability_schedules where provider_email = ${email} and kind = 'weekly'`
  for (const weekday of days) await tx`insert into soundstage.availability_schedules (provider_email, kind, weekday) values (${email}, 'weekly', ${weekday})`
  return days
}

export async function toggleBlockedDate(actor: Actor, date: unknown) {
  const email = providerEmail(actor)
  const day = validDate(date)
  const tx = currentTx()
  const removed = await tx<{ id: string }[]>`delete from soundstage.availability_schedules where provider_email = ${email} and kind = 'blocked' and blocked_date = ${day}::date returning id`
  if (removed.length) return { date: day, blocked: false }
  await tx`insert into soundstage.availability_schedules (provider_email, kind, blocked_date) values (${email}, 'blocked', ${day}::date)`
  return { date: day, blocked: true }
}

// Dates in [fromDate, toDate) a client cannot book: blocked, non-working, or held by a blocking booking.
export async function unavailableDates(providerEmail: string, fromDate: string, toDate: string) {
  const tx = currentTx()
  const email = providerEmail.toLowerCase()
  const schedule = await tx<{ kind: string; weekday: number | null; blocked_date: unknown }[]>`select kind, weekday, blocked_date from soundstage.availability_schedules where provider_email = ${email}`
  const blocked = new Set(schedule.filter(s => s.kind === "blocked").map(s => dateText(s.blocked_date)))
  const weekly = new Set(schedule.filter(s => s.kind === "weekly").map(s => Number(s.weekday)))
  const bookings = await tx<{ start_date: unknown; end_date: unknown }[]>`select start_date, end_date from soundstage.bookings
    where provider_email = ${email} and daterange(start_date, end_date) && daterange(${fromDate}::date, ${toDate}::date)
      and (status in ('confirmed', 'in_progress') or (status = 'awaiting_payment' and hold_expires_at > now()))`
  const taken = new Set<string>()
  for (const b of bookings) for (let d = dateText(b.start_date); d < dateText(b.end_date); d = addDays(d, 1)) taken.add(d)
  const result: string[] = []
  for (let d = fromDate; d < toDate; d = addDays(d, 1)) {
    if (blocked.has(d) || taken.has(d) || (weekly.size && !weekly.has(new Date(d + "T00:00:00Z").getUTCDay()))) result.push(d)
  }
  return result
}
