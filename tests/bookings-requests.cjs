const { test } = require('node:test')
const assert = require('node:assert/strict')
const { openDatabase, seed } = require('./helpers/seed.cjs')
const tables = require('./helpers/record-tables.cjs')

const load = require('./helpers/ts-loader.cjs')()
const runtime = load('lib/server/runtime.ts')
const core = load('lib/server/bookings/core.ts')
const requests = load('lib/server/bookings/requests.ts')
const availability = load('lib/server/bookings/availability.ts')
const { MemoryStorage } = load('lib/data/memory-storage.ts')

const day = offset => new Date(Date.parse(core.manilaToday() + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10)
const weekday = date => new Date(date + 'T00:00:00Z').getUTCDay()
const client = { id: 'user_client', email: 'client@test.com', role: 'client' }
const other = { id: 'user_other', email: 'other@test.com', role: 'client' }
const provider = { id: 'user_provider', email: 'provider@test.com', role: 'provider' }
const rival = { id: 'user_rival', email: 'rival@test.com', role: 'provider' }

async function setup() {
  const db = await openDatabase()
  const ids = await seed(db, {
    users: [{ email: 'client@test.com', role: 'client' }, { email: 'other@test.com', role: 'client' }, { email: 'provider@test.com', role: 'provider' }, { email: 'rival@test.com', role: 'provider' }],
    packages: [{ key: 'svc-1', provider: 'provider@test.com' }, { key: 'svc-rival', provider: 'rival@test.com' }],
  })
  const values = await tables.readRecords(db)
  // Booking ids restart in every database, so the fake ledger starts empty too.
  paid.clear()
  const run = fn => db.transaction(connection => {
    const tx = async (parts, ...args) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), args)).rows
    return runtime.context.run({ storage: new MemoryStorage(values), session: new MemoryStorage(), tx }, fn)
  })
  const one = async (sql, args) => (await db.query(sql, args)).rows
  return { db, run, one, ids }
}
let keys = 0
const create = (h, date, actor = client, packageId = 'svc-1') => h.run(() => core.createBooking(actor, { packageId: h.ids[packageId], date, durationDays: 1, eventTown: 'Manila' }, 'rk-' + ++keys))
const paid = new Map()
core.registerPaidTotal(async id => paid.get(id) || 0)
async function confirmed(h, date, actor = client) {
  const { id } = await create(h, date, actor)
  await h.run(() => core.transition(id, 'accepted', provider))
  paid.set(id, 3000)
  assert.deepEqual(await h.run(() => core.confirmFromPayment(id)), { confirmed: true })
  return id
}
const status = async (h, id) => (await h.one('SELECT status FROM soundstage.bookings WHERE booking_id=$1', [id]))[0].status

test('reschedule requests: one pending per booking, only on allowed statuses (AC21)', async () => {
  const h = await setup()
  try {
    const id = await confirmed(h, day(20))
    const request = await h.run(() => requests.requestReschedule(client, id, day(25), 1, 'Venue moved'))
    assert.equal(request.status, 'pending')
    await assert.rejects(h.run(() => requests.requestReschedule(client, id, day(26), 1)), /reschedule request is already pending/)
    await assert.rejects(h.run(() => requests.requestReschedule(other, id, day(26), 1)), /Booking not found/)
    const { id: pending } = await create(h, day(30))
    await assert.rejects(h.run(() => requests.requestReschedule(client, pending, day(31), 1)), /Cannot reschedule a booking that is pending/)
    assert.deepEqual(request.id, id)
    const [row] = await h.one("SELECT request_type, request_status, request_reason, to_char(requested_date, 'YYYY-MM-DD') AS d FROM soundstage.bookings WHERE booking_id=$1", [id])
    assert.deepEqual(row, { request_type: 'reschedule', request_status: 'pending', request_reason: 'Venue moved', d: day(25) })
    // One pending request at a time, of either kind.
    await assert.rejects(h.run(() => requests.requestCancellation(client, id)), /reschedule request is already pending/)
  } finally { await h.db.close() }
})

test('approving a reschedule re-checks availability in the same transaction (AC22, AC24)', async () => {
  const h = await setup()
  try {
    const id = await confirmed(h, day(40))
    const { id: free } = await h.run(() => requests.requestReschedule(client, id, day(45), 2))
    assert.deepEqual(await h.run(() => requests.decideReschedule(provider, free, true)), { id: free, status: 'approved' })
    const [moved] = await h.one("SELECT to_char(event_date,'YYYY-MM-DD') s, to_char(event_date + duration_days,'YYYY-MM-DD') e FROM soundstage.bookings WHERE booking_id=$1", [id])
    assert.deepEqual([moved.s, moved.e], [day(45), day(47)])
    await assert.rejects(h.run(() => requests.decideReschedule(provider, free, false)), /already decided/)

    const { id: taken } = await h.run(() => requests.requestReschedule(client, id, day(50), 1))
    await confirmed(h, day(50), other)
    await assert.rejects(h.run(() => requests.decideReschedule(provider, taken, true)), /These dates are already booked/)
    const [request] = await h.one('SELECT request_status FROM soundstage.bookings WHERE booking_id=$1', [taken])
    assert.equal(request.request_status, 'pending')
    const [still] = await h.one("SELECT to_char(event_date,'YYYY-MM-DD') s FROM soundstage.bookings WHERE booking_id=$1", [id])
    assert.equal(still.s, day(45))
    await assert.rejects(h.run(() => requests.decideReschedule(rival, taken, true)), /Request not found/)
    await assert.rejects(h.run(() => requests.decideReschedule(client, taken, true)), /permission/)
    assert.deepEqual(await h.run(() => requests.decideReschedule(provider, taken, false)), { id: taken, status: 'declined' })
  } finally { await h.db.close() }
})

test('cancelling: unpaid is instant, paid confirmed needs an approved request (AC23, AC24)', async () => {
  const h = await setup()
  try {
    const { id: unpaid } = await create(h, day(60))
    assert.equal((await h.run(() => requests.requestCancellation(client, unpaid))).status, 'cancelled')
    const id = await confirmed(h, day(61))
    const request = await h.run(() => requests.requestCancellation(client, id, 'Event called off'))
    assert.equal(request.status, 'pending')
    assert.equal(await status(h, id), 'confirmed')
    await assert.rejects(h.run(() => requests.requestCancellation(client, id)), /cancellation request is already pending/)
    assert.deepEqual(await h.run(() => requests.decideCancellation(provider, request.id, true)), { id: request.id, status: 'approved' })
    assert.equal(await status(h, id), 'cancelled')
    const [row] = await h.one('SELECT cancelled_by FROM soundstage.bookings WHERE booking_id=$1', [id])
    assert.equal(row.cancelled_by, 'client')
    const [last] = await h.one("SELECT old_value, new_value, actor_role, reason FROM soundstage.audit_log WHERE table_name='bookings' AND record_id=$1 AND action='Booking status changed' ORDER BY audit_id DESC LIMIT 1", [id])
    assert.deepEqual(last, { old_value: 'confirmed', new_value: 'cancelled', actor_role: 'system', reason: 'cancellation approved by provider' })
    await assert.rejects(h.run(() => requests.decideCancellation(provider, request.id, false)), /already decided/)

    const declined = await confirmed(h, day(62))
    const { id: no } = await h.run(() => requests.requestCancellation(client, declined))
    await h.run(() => requests.decideCancellation(provider, no, false))
    assert.equal(await status(h, declined), 'confirmed')
  } finally { await h.db.close() }
})

test('availability: weekly days and blocked dates drive isBookable (AC25)', async () => {
  const h = await setup()
  try {
    const target = day(70)
    assert.deepEqual(await h.run(() => core.isBookable('provider@test.com', target, day(71))), { ok: true })
    const works = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== weekday(target))
    await h.run(() => availability.setWeeklyDays(provider, works))
    assert.deepEqual(await h.run(() => core.isBookable('provider@test.com', target, day(71))), { ok: false, reason: 'unavailable_day' })
    await h.run(() => availability.setWeeklyDays(provider, []))
    assert.equal((await h.one('SELECT * FROM soundstage.schedules WHERE weekday IS NOT NULL')).length, 0)
    assert.deepEqual(await h.run(() => availability.toggleBlockedDate(provider, target)), { date: target, blocked: true })
    assert.deepEqual(await h.run(() => core.isBookable('provider@test.com', target, day(71))), { ok: false, reason: 'blocked' })
    assert.deepEqual(await h.run(() => availability.unavailableDates('provider@test.com', day(69), day(72))), [target])
    assert.deepEqual(await h.run(() => availability.toggleBlockedDate(provider, target)), { date: target, blocked: false })
    await assert.rejects(h.run(() => availability.setWeeklyDays(provider, [7])), /0 to 6/)
    await assert.rejects(h.run(() => availability.setWeeklyDays(client, [1])), /permission/)
    await assert.rejects(h.run(() => availability.toggleBlockedDate(provider, '2026-02-30')), /Invalid event date/)
    await confirmed(h, day(80))
    assert.deepEqual(await h.run(() => availability.unavailableDates('provider@test.com', day(79), day(82))), [day(80)])
  } finally { await h.db.close() }
})
