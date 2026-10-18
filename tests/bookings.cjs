const { test } = require('node:test')
const assert = require('node:assert/strict')
const { openDatabase, seed, insertBooking } = require('./helpers/seed.cjs')
const tables = require('./helpers/record-tables.cjs')

const load = require('./helpers/ts-loader.cjs')()
const runtime = load('lib/server/runtime.ts')
const core = load('lib/server/bookings/core.ts')
const { TRANSITIONS, BOOKING_STATUSES } = load('lib/server/bookings/rules.ts')
const { MemoryStorage } = load('lib/data/memory-storage.ts')

const day = offset => new Date(Date.parse(core.manilaToday() + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10)
const client = { id: 'user_client', email: 'client@test.com', role: 'client' }
const other = { id: 'user_other', email: 'other@test.com', role: 'client' }
const provider = { id: 'user_provider', email: 'provider@test.com', role: 'provider' }
const rival = { id: 'user_rival', email: 'rival@test.com', role: 'provider' }
const system = { id: 'system', email: '', role: 'system' }

async function setup() {
  const db = await openDatabase()
  const ids = await seed(db, {
    users: [{ email: 'client@test.com', role: 'client' }, { email: 'other@test.com', role: 'client' }, { email: 'provider@test.com', role: 'provider' },
      { email: 'rival@test.com', role: 'provider' }, { email: 'pending@test.com', role: 'provider', status: 'pending' }, { email: 'pm@test.com', role: 'payroll_master' }],
    packages: [{ key: 'svc-1', provider: 'provider@test.com' }, { key: 'svc-off', provider: 'provider@test.com', active: false },
      { key: 'svc-rival', provider: 'rival@test.com' }, { key: 'svc-unapproved', provider: 'pending@test.com' }],
  })
  const values = await tables.readRecords(db)
  // Each call is one request transaction, like data-service execute().
  const run = (fn, wrap = q => q) => db.transaction(connection => {
    const tx = wrap(async (parts, ...args) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), args)).rows)
    return runtime.context.run({ storage: new MemoryStorage(values), session: new MemoryStorage(), tx }, fn)
  })
  const one = async (sql, args) => (await db.query(sql, args)).rows
  return { db, run, one, values, ids }
}
const statusLog = h => h.one("SELECT old_value, new_value, actor_role, reason FROM soundstage.audit_log WHERE table_name = 'bookings' ORDER BY audit_id")
let keys = 0
const input = (h, date, extra = {}) => ({ packageId: h.ids['svc-1'], date, durationDays: 1, eventTown: 'Manila', time: '18:00', location: 'Hall', ...extra, ...(extra.packageId ? { packageId: h.ids[extra.packageId] } : {}) })
const create = (h, date, extra, actor = client) => h.run(() => core.createBooking(actor, input(h, date, extra), 'key-' + ++keys))

test('create stores a pending booking with a snapshot and one status row, idempotently (AC7, AC8 evidence, AC10)', async () => {
  const h = await setup()
  try {
    const first = await h.run(() => core.createBooking(client, input(h, day(10)), 'same-key'))
    const again = await h.run(() => core.createBooking(client, input(h, day(10)), 'same-key'))
    assert.equal(again.id, first.id)
    assert.match(first.id, /^\d+$/)
    await assert.rejects(h.run(() => core.createBooking(other, input(h, day(10)), 'same-key')), /request key is already used/)
    const rows = await h.one('SELECT * FROM soundstage.bookings')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'pending')
    assert.equal(rows[0].package_name, 'Pro Sound svc-1')
    assert.equal(Number(rows[0].package_price), 10000)
    assert.equal(Number(rows[0].total_amount), 10000)
    assert.equal(String(rows[0].client_id), h.ids['client@test.com'])
    assert.equal(String(rows[0].provider_id), h.ids['provider@test.com'])
    const history = await statusLog(h)
    assert.deepEqual(history.map(r => [r.old_value, r.new_value, r.actor_role]), [[null, 'pending', 'client']])
    // Editing the package afterwards leaves the snapshot alone.
    await h.db.query("UPDATE soundstage.service_packages SET name = 'Renamed', price = 1 WHERE package_id = $1", [h.ids['svc-1']])
    const [after] = await h.one('SELECT package_name, package_price FROM soundstage.bookings')
    assert.equal(after.package_name, 'Pro Sound svc-1')
    assert.equal(Number(after.package_price), 10000)
    await assert.rejects(h.run(() => core.createBooking(provider, input(h, day(11)), 'k-provider')), /permission/)
    await assert.rejects(h.run(() => core.createBooking(client, input(h, day(11)), '')), /request key/)
    await assert.rejects(h.run(() => core.createBooking(client, input(h, day(11), { time: 'evening' }), 'k-time')), /Enter the event time/)
  } finally { await h.db.close() }
})

test('create rejects unavailable bookings with a specific error and writes nothing (AC9)', async () => {
  const h = await setup()
  try {
    await h.db.query('INSERT INTO soundstage.schedules(provider_id, available_date, is_available) VALUES ($1, $2, false)', [h.ids['provider@test.com'], day(20)])
    const working = new Date(day(30) + 'T00:00:00Z').getUTCDay()
    await h.db.query('INSERT INTO soundstage.schedules(provider_id, weekday, is_available) VALUES ($1, $2, true)', [h.ids['rival@test.com'], working])
    const taken = await create(h, day(40))
    await h.db.query("UPDATE soundstage.bookings SET status='confirmed' WHERE booking_id=$1", [taken.id])
    const before = (await h.one('SELECT count(*)::int AS n FROM soundstage.bookings'))[0].n
    await assert.rejects(create(h, day(-1)), /from today onward/)
    await assert.rejects(create(h, day(19), { durationDays: 2 }), /blocked a selected date/)
    await assert.rejects(create(h, day(31), { packageId: 'svc-rival' }), /does not work on a selected day/)
    await create(h, day(30), { packageId: 'svc-rival' })
    await assert.rejects(create(h, day(40)), /already booked/)
    await assert.rejects(create(h, day(50), { packageId: 'svc-off' }), /no longer available/)
    await assert.rejects(create(h, day(50), { packageId: 'svc-unapproved' }), /not accepting bookings/)
    await assert.rejects(create(h, '2026-02-30'), /Invalid event date/)
    assert.equal((await h.one('SELECT count(*)::int AS n FROM soundstage.bookings'))[0].n, before + 1)
  } finally { await h.db.close() }
})

test('only spec transitions are allowed and errors name the current status (AC11)', async () => {
  const h = await setup()
  try {
    const actors = { client, provider, system, admin: { id: 'user_admin', email: 'a@test.com', role: 'admin' } }
    for (const from of BOOKING_STATUSES) {
      const { id } = await create(h, day(60))
      await h.db.query('UPDATE soundstage.bookings SET status=$1 WHERE booking_id=$2', [from, id])
      for (const to of BOOKING_STATUSES) for (const [name, actor] of Object.entries(actors)) {
        if (TRANSITIONS.some(r => r.from === from && r.to === to && r.actor === name)) continue
        await assert.rejects(h.run(() => core.transition(id, to, actor, 'reason')), error => name === 'admin' ? /not found/.test(error.message) : error.message.endsWith('a booking that is ' + from))
      }
      await h.db.query("UPDATE soundstage.bookings SET status='cancelled' WHERE booking_id=$1", [id])
    }
  } finally { await h.db.close() }
})

test('accept starts a 48h hold, decline needs a reason, and non-owners get 404 (AC12, AC13)', async () => {
  const h = await setup()
  try {
    const { id } = await create(h, day(70))
    await assert.rejects(h.run(() => core.transition(id, 'accepted', other)), error => error.status === 404 && error.message === 'Booking not found.')
    await assert.rejects(h.run(() => core.transition(id, 'accepted', rival)), error => error.status === 404 && error.message === 'Booking not found.')
    await assert.rejects(h.run(() => core.transition('999999', 'accepted', provider)), /not found/)
    await assert.rejects(h.run(() => core.transition('not-a-number', 'accepted', provider)), /not found/)
    await assert.rejects(h.run(() => core.transition(id, 'declined', provider)), /reason is required/)
    await assert.rejects(h.run(() => core.transition(id, 'declined', provider, '   ')), /reason is required/)
    assert.deepEqual(await h.run(() => core.transition(id, 'accepted', provider)), { id, status: 'awaiting_payment' })
    const [row] = await h.one('SELECT status, hold_expires_at > now() + interval \'47 hours\' AS held FROM soundstage.bookings')
    assert.equal(row.held, true)
    const history = await statusLog(h)
    assert.deepEqual(history.slice(1).map(r => [r.old_value, r.new_value, r.actor_role]), [['pending', 'accepted', 'provider'], ['accepted', 'awaiting_payment', 'system']])
    // A failing audit insert rolls the status change back with the request.
    const failing = q => (parts, ...args) => parts.join('').includes('audit_log') ? Promise.reject(new Error('audit down')) : q(parts, ...args)
    await assert.rejects(h.run(() => core.transition(id, 'cancelled', client), failing), /audit down/)
    assert.equal((await h.one('SELECT status FROM soundstage.bookings'))[0].status, 'awaiting_payment')
    await h.run(() => core.transition(id, 'cancelled', client))
    assert.equal((await h.one('SELECT cancelled_by FROM soundstage.bookings'))[0].cancelled_by, 'client')
  } finally { await h.db.close() }
})

test('racing transitions apply at most once (AC14)', async () => {
  const h = await setup()
  try {
    const { id } = await create(h, day(80))
    // PGlite serializes transactions; the loser sees the winner's committed status.
    const results = await Promise.allSettled([h.run(() => core.transition(id, 'accepted', provider)), h.run(() => core.transition(id, 'declined', provider, 'Fully booked'))])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.match(results.find(r => r.status === 'rejected').reason.message, /a booking that is (awaiting_payment|declined)$/)
    // A stale status in the conditional UPDATE affects zero rows and is rejected.
    const { id: second } = await create(h, day(81))
    const stale = q => (parts, ...args) => parts.join('').includes('for update') ? q(parts, ...args).then(rows => rows.map(r => ({ ...r, status: 'pending' }))) : q(parts, ...args)
    await h.db.query("UPDATE soundstage.bookings SET status='declined' WHERE booking_id=$1", [second])
    await assert.rejects(h.run(() => core.transition(second, 'accepted', provider), stale), /a booking that is pending$/)
    assert.equal((await h.one('SELECT status FROM soundstage.bookings WHERE booking_id=$1', [second]))[0].status, 'declined')
  } finally { await h.db.close() }
})

test('verified payment of 30% confirms; less, taken dates, or expired holds do not (AC16, AC17, AC20)', async () => {
  const h = await setup()
  const paid = new Map()
  core.registerPaidTotal(async id => paid.get(id) || 0)
  const lastStatus = async id => (await h.one("SELECT new_value, actor_role, reason FROM soundstage.audit_log WHERE table_name='bookings' AND record_id=$1 ORDER BY audit_id DESC LIMIT 1", [id]))[0]
  try {
    const { id } = await create(h, day(90))
    await h.run(() => core.transition(id, 'accepted', provider))
    // A direct system transition cannot confirm without the verified downpayment (review-2 F1).
    await assert.rejects(h.run(() => core.transition(id, 'confirmed', system)), /downpayment has not been verified/)
    assert.equal((await h.one('SELECT status FROM soundstage.bookings WHERE booking_id=$1', [id]))[0].status, 'awaiting_payment')
    paid.set(id, 2900)
    await assert.rejects(h.run(() => core.transition(id, 'confirmed', system)), /downpayment has not been verified/)
    assert.deepEqual(await h.run(() => core.confirmFromPayment(id)), { confirmed: false, reason: 'insufficient' })
    paid.set(id, 3000)
    assert.deepEqual(await h.run(() => core.confirmFromPayment(id)), { confirmed: true })
    const last = await lastStatus(id)
    assert.deepEqual([last.new_value, last.actor_role], ['confirmed', 'system'])
    await assert.rejects(h.run(() => core.transition(id, 'cancelled', client)), /a booking that is confirmed$/)
    assert.deepEqual(await h.run(() => core.confirmFromPayment(id)), { confirmed: false, reason: 'not_awaiting_payment' })

    const { id: late } = await create(h, day(100))
    await h.run(() => core.transition(late, 'accepted', provider))
    // Another booking confirmed on the same dates by a path outside this hold.
    await insertBooking(h.db, h.ids, { client: 'other@test.com', provider: 'provider@test.com', pkg: 'svc-1', date: day(100), status: 'confirmed' })
    paid.set(late, 3000)
    assert.deepEqual(await h.run(() => core.confirmFromPayment(late)), { confirmed: false, reason: 'dates_taken' })
    assert.equal((await h.one('SELECT status FROM soundstage.bookings WHERE booking_id=$1', [late]))[0].status, 'awaiting_payment')

    const { id: held } = await create(h, day(110))
    await h.run(() => core.transition(held, 'accepted', provider))
    await assert.rejects(create(h, day(110), {}, other), /already booked/)
    await h.db.query("UPDATE soundstage.bookings SET hold_expires_at = now() - interval '1 minute' WHERE booking_id=$1", [held])
    await create(h, day(110), {}, other)
    assert.equal((await h.one('SELECT status FROM soundstage.bookings WHERE booking_id=$1', [held]))[0].status, 'cancelled')
    const reason = await lastStatus(held)
    assert.deepEqual([reason.reason, reason.actor_role], ['payment expired', 'system'])
    paid.set(held, 3000)
    assert.deepEqual(await h.run(() => core.confirmFromPayment(held)), { confirmed: false, reason: 'hold_expired' })
  } finally { core.registerPaidTotal(async () => 0); await h.db.close() }
})

test('provider starts and completes only on or after the start date; paid bookings need a request to cancel', async () => {
  const h = await setup()
  const paid = new Map()
  core.registerPaidTotal(async id => paid.get(id) || 0)
  try {
    const { id: future } = await create(h, day(5))
    await h.db.query("UPDATE soundstage.bookings SET status='confirmed' WHERE booking_id=$1", [future])
    await assert.rejects(h.run(() => core.transition(future, 'in_progress', provider)), /on or after the event start date/)
    const { id: today } = await create(h, day(0))
    await h.db.query("UPDATE soundstage.bookings SET status='confirmed' WHERE booking_id=$1", [today])
    await h.run(() => core.transition(today, 'in_progress', provider))
    assert.deepEqual(await h.run(() => core.transition(today, 'completed', provider)), { id: today, status: 'completed' })
    const { id: prepaid } = await create(h, day(6))
    paid.set(prepaid, 3000)
    await assert.rejects(h.run(() => core.transition(prepaid, 'cancelled', client)), /cancellation request/)
    // Money that already covers the downpayment confirms straight after accept.
    assert.deepEqual(await h.run(() => core.transition(prepaid, 'accepted', provider)), { id: prepaid, status: 'confirmed' })
  } finally { core.registerPaidTotal(async () => 0); await h.db.close() }
})

test('bookings are visible only to their client, provider, admin and payroll master (plan 4 T4.2)', async () => {
  const h = await setup()
  const compat = load('lib/server/bookings/compat.ts')
  try {
    const mine = (await create(h, day(5))).id
    const theirs = (await create(h, day(6), {}, other)).id
    const rivals = (await create(h, day(7), { packageId: 'svc-rival' })).id
    const seen = async viewer => (await h.run(() => compat.listVisible(viewer))).map(v => v.booking.id).sort()
    assert.deepEqual(await seen(client), [mine, rivals].sort())
    assert.deepEqual(await seen(other), [theirs])
    assert.deepEqual(await seen(provider), [mine, theirs].sort())
    assert.deepEqual(await seen(rival), [rivals])
    assert.deepEqual(await seen({ email: 'admin@test.com', role: 'admin' }), [mine, theirs, rivals].sort())
    assert.deepEqual(await seen({ email: 'pm@test.com', role: 'payroll_master' }), [mine, theirs, rivals].sort())
    assert.deepEqual(await seen(null), [])
    const [view] = (await h.run(() => compat.listVisible(other))).map(v => v.booking)
    assert.equal(view.status, 'pending')
    assert.equal(view.paid, false)
    assert.equal(view.downpayment, 3000)
    assert.equal(view.time, '6:00 PM')
    assert.equal(view.client, 'client Test')
  } finally { await h.db.close() }
})

test('every booking status has a label and style (AC27, plan 4 T4.3)', () => {
  const { statusStyles } = load('lib/marketplace/mock-data.ts')
  for (const status of [...BOOKING_STATUSES, 'Pending', 'Confirmed', 'Cancelled', 'Completed']) {
    assert.ok(statusStyles[status]?.label, status)
    assert.ok(statusStyles[status]?.className, status)
  }
})

test('refunds: paid provider-cancelled bookings only, once, decided by the payroll master (spec refund rows, AC26)', async () => {
  const h = await setup()
  const compat = load('lib/server/bookings/compat.ts')
  const paid = new Set()
  core.registerPaidTotal(async id => paid.has(id) ? 3000 : 0)
  const pm = { id: 'pm', email: 'pm@test.com', role: 'payroll_master' }
  try {
    const id = (await create(h, day(9))).id
    await h.run(() => core.transition(id, 'accepted', provider))
    paid.add(id)
    await h.db.query("INSERT INTO soundstage.payments (booking_id, user_id, amount, payment_type, payment_status, payment_method) VALUES ($1, $2, 3000, 'downpayment', 'paid', 'PayMongo: gcash')", [id, h.ids['client@test.com']])
    await h.run(() => core.confirmFromPayment(id))
    await assert.rejects(h.run(() => compat.requestRefund(client, id, 'GCash', '09123456789')), /Cannot request a refund for a booking that is confirmed/)
    await h.run(() => core.transition(id, 'cancelled', provider, 'Equipment failure'))
    // The client list shows the booking because the server says it qualifies.
    assert.equal((await h.run(() => compat.getOwned(client, id))).refundEligible, true)
    await assert.rejects(h.run(() => compat.requestRefund(other, id, 'GCash', '09123456789')), /not found/)
    await assert.rejects(h.run(() => compat.requestRefund(client, id, 'Cash', '09123456789')), /payout method/)
    assert.equal((await h.run(() => compat.requestRefund(client, id, 'GCash', '09123456789'))).status, 'refund_pending')
    assert.equal((await h.run(() => compat.getOwned(client, id))).refundEligible, undefined)
    const pending = (await h.run(() => compat.getOwned(client, id))).refund
    assert.deepEqual({ status: pending.status, amount: pending.amount, method: pending.method }, { status: 'Pending', amount: 3000, method: 'GCash' })
    await assert.rejects(h.run(() => compat.reviewRefund({ ...pm, role: 'admin' }, id, 'Paid', 'REF-1')), /permission/)
    await assert.rejects(h.run(() => compat.reviewRefund(pm, id, 'Paid', '')), /reference/)
    assert.equal((await h.run(() => compat.reviewRefund(pm, id, 'Rejected', 'Not eligible'))).status, 'cancelled')
    const rejected = await h.run(() => compat.getOwned(pm, id))
    assert.deepEqual({ status: rejected.refund.status, reason: rejected.refund.reason, by: rejected.cancelledBy }, { status: 'Rejected', reason: 'Not eligible', by: 'provider' })
    const [refund] = await h.one('SELECT status, remarks, decided_by FROM soundstage.refunds WHERE booking_id = $1', [id])
    assert.deepEqual([refund.status, refund.remarks, String(refund.decided_by)], ['rejected', 'Not eligible', h.ids['pm@test.com']])
    await assert.rejects(h.run(() => compat.requestRefund(client, id, 'GCash', '09123456789')), /already exists/)
    await assert.rejects(h.run(() => compat.reviewRefund(pm, id, 'Paid', 'REF-1')), /no longer pending/)
    // A client cancelling an unpaid booking never qualifies.
    const unpaid = (await create(h, day(12))).id
    await h.run(() => core.transition(unpaid, 'cancelled', client))
    assert.equal((await h.run(() => compat.getOwned(client, unpaid))).refundEligible, undefined)
    await assert.rejects(h.run(() => compat.requestRefund(client, unpaid, 'GCash', '09123456789')), /Only paid events/)
  } finally { core.registerPaidTotal(async () => 0); await h.db.close() }
})
