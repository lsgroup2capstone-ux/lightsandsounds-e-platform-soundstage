// Dry-run by default. Pass --execute only after reviewing the counts and the unmappable/conflict lists.
// --export <file> writes table bookings back as legacy JSON records (read-only against the database).
require('@next/env').loadEnvConfig(process.cwd())

const LOCK = 74832019
const BOOKING_PREFIX = 'soundstage-client-bookings-v3:'
const SERVICE_PREFIX = 'soundstage-provider-services-v2:'
const SCHEDULE_PREFIX = 'soundstage-schedule:'
const PAYMENT_PREFIX = 'soundstage-paymongo:'
const DAY = 86400000
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10)
const dateText = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const email = key => decodeURIComponent(key).trim().toLowerCase()
const parse = value => typeof value === 'string' ? JSON.parse(value) : value
class DryRun extends Error {}

// Design U2. Returns null for anything that cannot be mapped safely.
function mapStatus(b) {
  if (b.status === 'Pending') return 'pending'
  if (b.status === 'Confirmed') return b.paid ? 'confirmed' : null
  if (b.status === 'Completed') return 'completed'
  if (b.status === 'Cancelled') return b.refund?.status === 'Pending' ? 'refund_pending' : b.refund?.status === 'Paid' ? 'refunded' : 'cancelled'
  return null
}

function serviceOwners(records) {
  const owners = new Map()
  for (const [key, value] of Object.entries(records)) {
    if (!key.startsWith(SERVICE_PREFIX)) continue
    for (const service of parse(value) || []) if (service?.id) owners.set(String(service.id), email(key.slice(SERVICE_PREFIX.length)))
  }
  return owners
}

function unmappableReason(b, provider) {
  if (!b || typeof b.id !== 'string' || !b.id) return 'missing id'
  if (!['Pending', 'Confirmed', 'Completed', 'Cancelled'].includes(b.status)) return `unknown status ${String(b.status)}`
  if (!provider) return 'missing provider'
  const days = b.durationDays === undefined ? 1 : b.durationDays
  if (typeof b.date !== 'string' || !isoDate.test(b.date) || addDays(b.date, 0) !== b.date || !Number.isInteger(days) || days < 1 || days > 30) return 'missing or invalid dates'
  if (b.status === 'Confirmed' && !b.paid) return 'confirmed but unpaid'
  if (b.cancelledBy !== undefined && b.cancelledBy !== null && !['client', 'provider', 'system'].includes(b.cancelledBy)) return `invalid cancelledBy ${String(b.cancelledBy)}`
  return null
}

const money = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null

async function history(tx, id, from, to, reason) {
  await tx`insert into soundstage.booking_status_history (booking_id, old_status, new_status, actor_role, reason) values (${id}, ${from}, ${to}, 'system', ${reason})`
}

async function migrateBooking(tx, clientEmail, b, provider, status, result) {
  const days = b.durationDays === undefined ? 1 : b.durationDays
  const total = money(b.total)
  const price = money(b.basePrice) ?? total ?? 0
  await tx`savepoint migrate_booking`
  try {
    // The snapshot is the booking's own stored copy, not today's package.
    const rows = await tx`insert into soundstage.bookings
      (client_email, provider_email, package_id, package_name, package_price, base_price, transportation_fee, total, start_date, end_date,
       event_time, event_type, location, event_town, guests, notes, image, status, cancelled_by, feedback, legacy_id)
      values (${clientEmail}, ${provider}, ${String(b.packageId || '')}, ${String(b.packageName || 'Booking')}, ${price}, ${money(b.basePrice)}, ${money(b.transportationFee)}, ${total},
       ${b.date}::date, ${addDays(b.date, days)}::date, ${b.time || null}, ${b.eventType || null}, ${b.location || null}, ${b.eventTown || null},
       ${Number.isInteger(b.guests) ? b.guests : null}, ${b.notes || null}, ${b.image || null}, ${status}, ${b.cancelledBy || null},
       ${b.feedback ? JSON.stringify(b.feedback) : null}::jsonb, ${b.id})
      on conflict (legacy_id) do nothing returning id`
    if (!rows.length) { await tx`release savepoint migrate_booking`; result.skipped.push(b.id); return }
    const id = rows[0].id
    // Refund rows keep the payout details where the refund screens read them (history reason).
    if (status === 'refund_pending' || status === 'refunded') {
      await history(tx, id, null, 'cancelled', 'migrated from JSON')
      await history(tx, id, 'cancelled', 'refund_pending', JSON.stringify({ method: b.refund.method || '', account: b.refund.account || '' }))
      if (status === 'refunded') await history(tx, id, 'refund_pending', 'refunded', String(b.refund.reference || 'migrated from JSON'))
    } else if (b.refund?.status === 'Rejected') {
      // A rejected request still counts as the one refund request (spec table; review-5 M1).
      await history(tx, id, null, 'cancelled', 'migrated from JSON')
      await history(tx, id, 'cancelled', 'refund_pending', JSON.stringify({ method: b.refund.method || '', account: b.refund.account || '' }))
      await history(tx, id, 'refund_pending', 'cancelled', String(b.refund.reason || 'migrated from JSON'))
    } else await history(tx, id, null, status, 'migrated from JSON')
    await tx`release savepoint migrate_booking`
    result.migrated.push(b.id)
  } catch (error) {
    await tx`rollback to savepoint migrate_booking`
    if (error.code !== '23P01') throw error
    const [other] = await tx`select coalesce(legacy_id, id::text) as id from soundstage.bookings where provider_email = ${provider}
      and status in ('confirmed', 'in_progress') and daterange(start_date, end_date) && daterange(${b.date}::date, ${addDays(b.date, days)}::date) limit 1`
    result.conflicts.push({ legacy_id: b.id, conflictsWith: other?.id || null })
  }
}

async function migratePayment(tx, record, result) {
  const legacyId = String(record?.id || '')
  if (!legacyId || !(Number(record.amount) > 0) || !record.email) { result.unmappable.push({ legacy_id: legacyId || null, reason: 'missing id, owner or amount' }); return }
  let targetId = String(record.email).toLowerCase()
  if (record.kind === 'booking') {
    const [booking] = await tx`select id from soundstage.bookings where legacy_id = ${legacyId}`
    if (!booking) { result.unmappable.push({ legacy_id: legacyId, reason: 'booking not migrated' }); return }
    targetId = booking.id
  } else if (record.kind !== 'subscription') { result.unmappable.push({ legacy_id: legacyId, reason: 'unknown kind' }); return }
  // Old open sessions cannot complete under the webhook-only flow, so they become expired (payments AC20).
  const status = record.paid ? 'paid' : 'expired'
  const rows = await tx`insert into soundstage.payments (target_kind, target_id, owner_email, type, plan, amount, status, checkout_session_id, checkout_url, method, legacy_id, paid_at)
    values (${record.kind}, ${targetId}, ${String(record.email).toLowerCase()}, ${record.kind === 'booking' ? 'downpayment' : 'subscription'}, ${record.plan || null}, ${Number(record.amount)}, ${status},
      ${record.sessionId || null}, ${record.checkoutUrl || null}, ${record.paid ? 'PayMongo (migrated)' : null}, ${legacyId}, null)
    on conflict do nothing returning id`
  ;(rows.length ? result.migrated : result.skipped).push(legacyId)
}

async function migrateBookings(sql, { execute = false } = {}) {
  const summary = {}
  try {
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(${LOCK})`
      const records = Object.fromEntries((await tx`select key, value from soundstage.records`).map(r => [r.key, r.value]))
      const owners = serviceOwners(records)
      const bookings = { migrated: [], skipped: [], conflicts: [], unmappable: [] }
      const payments = { migrated: [], skipped: [], unmappable: [] }
      const blockedDates = { migrated: 0, skipped: 0, invalid: 0 }
      for (const [key, value] of Object.entries(records)) {
        if (!key.startsWith(BOOKING_PREFIX)) continue
        const clientEmail = email(key.slice(BOOKING_PREFIX.length))
        for (const b of parse(value) || []) {
          const provider = owners.get(String(b?.packageId))
          const reason = unmappableReason(b, provider)
          if (reason) { bookings.unmappable.push({ legacy_id: b?.id || null, reason }); continue }
          await migrateBooking(tx, clientEmail, b, provider, mapStatus(b), bookings)
        }
      }
      for (const [key, value] of Object.entries(records)) if (key.startsWith(PAYMENT_PREFIX)) await migratePayment(tx, parse(value), payments)
      for (const [key, value] of Object.entries(records)) {
        if (!key.startsWith(SCHEDULE_PREFIX)) continue
        const provider = email(key.slice(SCHEDULE_PREFIX.length))
        for (const day of parse(value) || []) {
          if (typeof day !== 'string' || !isoDate.test(day) || addDays(day, 0) !== day) { blockedDates.invalid++; continue }
          const rows = await tx`insert into soundstage.availability_schedules (provider_email, kind, blocked_date) values (${provider}, 'blocked', ${day}::date) on conflict do nothing returning id`
          rows.length ? blockedDates.migrated++ : blockedDates.skipped++
        }
      }
      Object.assign(summary, { execute, bookings, payments, blockedDates })
      // JSON records are never written; a dry run rolls back everything above.
      if (!execute) throw new DryRun()
    })
  } catch (error) { if (!(error instanceof DryRun)) throw error }
  return summary
}

// Emergency revert: table bookings in the legacy record shape, keyed per client (rollback NFR).
const LEGACY = { pending: 'Pending', accepted: 'Pending', awaiting_payment: 'Pending', confirmed: 'Confirmed', in_progress: 'Confirmed', completed: 'Completed', declined: 'Cancelled', cancelled: 'Cancelled', refund_pending: 'Cancelled', refunded: 'Cancelled' }
async function exportBookings(sql) {
  const rows = await sql`select b.*, coalesce((select sum(amount) from soundstage.payments p where p.target_kind = 'booking' and p.target_id = b.id::text and p.status in ('paid', 'partially_refunded')), 0) as paid_total,
      (select reason from soundstage.booking_status_history h where h.booking_id = b.id and h.new_status = 'refund_pending' order by h.id desc limit 1) as refund_details,
      (select created_at from soundstage.booking_status_history h where h.booking_id = b.id and h.new_status = 'refund_pending' order by h.id desc limit 1) as refund_at,
      (select reason from soundstage.booking_status_history h where h.booking_id = b.id and h.new_status = 'refunded' order by h.id desc limit 1) as refund_reference
    from soundstage.bookings b order by b.client_email, b.start_date, b.id`
  // Display names come from the (read-only) account records, as the live projection does.
  const [accounts] = await sql`select value from soundstage.records where key = 'soundstage-accounts-v2'`
  const byEmail = new Map((parse(accounts?.value) || []).map(a => [String(a.email).toLowerCase(), a]))
  const person = e => { const a = byEmail.get(e); return a ? `${a.firstName || ''} ${a.lastName || ''}`.trim() || e : e }
  const business = e => byEmail.get(e)?.business || person(e)
  const out = {}
  for (const r of rows) {
    const start = dateText(r.start_date)
    const total = r.total === null ? Number(r.package_price) : Number(r.total)
    const paid = Number(r.paid_total) > 0 && Number(r.paid_total) >= Math.round(0.3 * total) // same rounding as core downpaymentFor
    let refund
    if (r.refund_details) {
      let details = {}
      try { details = JSON.parse(r.refund_details || '{}') } catch {}
      refund = { status: r.status === 'refunded' ? 'Paid' : r.status === 'cancelled' ? 'Rejected' : 'Pending', amount: Number(r.paid_total), method: details.method || '', account: details.account || '', requestedAt: r.refund_at ? new Date(r.refund_at).toISOString() : '', ...(r.status === 'refunded' ? { reference: r.refund_reference || '' } : {}) }
    }
    const booking = {
      id: r.legacy_id || r.id, packageId: r.package_id || '', packageName: r.package_name, provider: business(r.provider_email), client: person(r.client_email), image: r.image || '', date: start,
      time: r.event_time || '', ...(r.event_type ? { eventType: r.event_type } : {}), location: r.location || '', guests: r.guests ?? 0, notes: r.notes || '',
      durationDays: Math.round((Date.parse(dateText(r.end_date)) - Date.parse(start)) / DAY), basePrice: r.base_price === null ? undefined : Number(r.base_price),
      transportationFee: r.transportation_fee === null ? undefined : Number(r.transportation_fee), eventTown: r.event_town || undefined, total,
      downpayment: Math.round(total * 0.3), status: LEGACY[r.status], paid, ...(r.cancelled_by ? { cancelledBy: r.cancelled_by === 'system' ? 'client' : r.cancelled_by } : {}),
      ...(refund ? { refund } : {}), ...(r.feedback ? { feedback: parse(r.feedback) } : {}),
    }
    const key = BOOKING_PREFIX + encodeURIComponent(r.client_email)
    ;(out[key] ||= []).push(JSON.parse(JSON.stringify(booking)))
  }
  return out
}

async function main() {
  const postgres = require('postgres')
  const { databaseConfig } = require('./database-config.cjs')
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const exportAt = process.argv.indexOf('--export')
    if (exportAt >= 0) {
      const file = process.argv[exportAt + 1]
      if (!file) throw new Error('Usage: --export <file>')
      require('node:fs').writeFileSync(file, JSON.stringify(await exportBookings(sql), null, 2))
      console.log(`exported bookings to ${file}`)
      return
    }
    const result = await migrateBookings(sql, { execute: process.argv.includes('--execute') })
    for (const item of result.bookings.unmappable) console.log(`unmappable booking ${item.legacy_id} ${item.reason}`)
    for (const item of result.bookings.conflicts) console.log(`conflict booking ${item.legacy_id} overlaps ${item.conflictsWith}`)
    for (const item of result.payments.unmappable) console.log(`unmappable payment ${item.legacy_id} ${item.reason}`)
    const count = group => Object.fromEntries(Object.entries(group).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]))
    console.log(JSON.stringify({ execute: result.execute, bookings: count(result.bookings), payments: count(result.payments), blockedDates: result.blockedDates }))
  } finally {
    await sql.end()
  }
}

module.exports = { migrateBookings, exportBookings }
if (require.main === module) main().catch(error => { console.error('Booking migration stopped:', String(error?.code || error?.message || error).slice(0, 160)); process.exitCode = 1 })
