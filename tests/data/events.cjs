const { test } = require('node:test')
const assert = require('node:assert/strict')
const { openDatabase, seed } = require('../helpers/seed.cjs')
const tables = require('../helpers/record-tables.cjs')

// Replaces the JSON-runtime checks: the same legacy function names now run on the booking tables (booking plan 4).
const load = require('../helpers/ts-loader.cjs')()
const runtime = load('lib/server/runtime.ts')
const core = load('lib/server/bookings/core.ts')
const bookings = load('lib/server/domain/client-bookings.ts')
const { MemoryStorage } = load('lib/data/memory-storage.ts')

async function setup() {
  const db = await openDatabase()
  const ids = await seed(db, {
    users: [{ email: 'client@example.com', role: 'client', first: 'Test', last: 'Client' }, { email: 'other@example.com', role: 'client', first: 'Other', last: 'Client' },
      { email: 'team@example.com', role: 'provider', business: 'Event Team' }, { email: 'rival@example.com', role: 'provider', business: 'Other Team' },
      { email: 'admin@example.com', role: 'admin' }, { email: 'pm@example.com', role: 'payroll_master' }],
    packages: [{ key: 'svc-1', provider: 'team@example.com', name: 'Lights', price: 5000, location: 'Balayan' }],
  })
  const values = { ...(await tables.readRecords(db)), 'soundstage-admin-account': JSON.stringify({ role: 'admin', email: 'admin@example.com' }) }
  const as = (role, email) => fn => db.transaction(connection => {
    const session = new MemoryStorage({ 'soundstage-session': JSON.stringify({ role, email }) })
    const tx = async (parts, ...args) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), args)).rows
    return runtime.context.run({ storage: new MemoryStorage(values), session, tx }, fn)
  })
  return {
    db, ids, client: as('client', 'client@example.com'), other: as('client', 'other@example.com'), team: as('provider', 'team@example.com'),
    rival: as('provider', 'rival@example.com'), admin: as('admin', 'admin@example.com'), pm: as('payroll_master', 'pm@example.com'),
  }
}
const today = () => core.manilaToday()
let n = 0
const book = (h, who = h.client, date = today()) => who(() => bookings.saveClientBooking({ packageId: h.ids['svc-1'], date, eventTown: 'Balayan', idempotencyKey: 'ev-' + ++n }))
const pay = (h, id, amount = 1500) => h.db.query("INSERT INTO soundstage.payments (booking_id, user_id, payment_type, amount, payment_status, payment_method) VALUES ($1, $2, 'downpayment', $3, 'paid', 'PayMongo: gcash')", [id, h.ids['client@example.com'], amount])
core.registerPaidTotal(async id => Number((await runtime.context.getStore().tx`select coalesce(sum(amount), 0) as t from soundstage.payments where booking_id = ${id} and payment_status = 'paid'`)[0].t))

test('legacy status names: provider ownership, transitions, completion, client isolation and feedback', async () => {
  const h = await setup()
  try {
    const { id } = await book(h)
    await assert.rejects(h.client(() => bookings.submitEventFeedback(id, 5, 'Great event')), /completed events/)
    await assert.rejects(h.client(() => bookings.updateClientBookingStatus(id, 'Completed')), /Cannot/)
    await assert.rejects(h.rival(() => bookings.updateClientBookingStatus(id, 'Confirmed')), /not found/)
    assert.equal((await h.team(() => bookings.updateClientBookingStatus(id, 'Confirmed'))).status, 'awaiting_payment')
    await assert.rejects(h.team(() => bookings.updateClientBookingStatus(id, 'Completed')), /awaiting_payment/)
    await pay(h, id)
    await h.team(() => core.confirmFromPayment(id))
    await assert.rejects(h.rival(() => bookings.updateClientBookingStatus(id, 'Completed')), /not found/)
    assert.equal((await h.team(() => bookings.updateClientBookingStatus(id, 'Completed'))).status, 'completed')
    const completed = (await h.client(() => bookings.getClientBookings()))[0]
    assert.ok(completed.completedAt)
    await assert.rejects(h.team(() => bookings.updateClientBookingStatus(id, 'Completed')), /completed/)
    await assert.rejects(h.team(() => bookings.updateClientBookingStatus(id, 'Cancelled')), /completed/)
    assert.equal((await h.other(() => bookings.getClientBookings())).length, 0)
    await assert.rejects(h.other(() => bookings.submitEventFeedback(id, 5, 'Great event')), /not found/)
    await assert.rejects(h.client(() => bookings.submitEventFeedback(id, 0, 'Great event')), /1–5 stars/)
    await assert.rejects(h.client(() => bookings.submitEventFeedback(id, 5, '   ')), /1–5 stars/)
    await h.client(() => bookings.submitEventFeedback(id, 5, ' Great event '))
    assert.equal((await h.client(() => bookings.getClientBookings()))[0].feedback.comment, 'Great event')
    await assert.rejects(h.client(() => bookings.submitEventFeedback(id, 4, 'Again')), /already/)
    const all = await h.admin(() => bookings.getAllBookings())
    assert.deepEqual([all[0].status, all[0].feedback.rating], ['completed', 5])
  } finally { await h.db.close() }
})

test('legacy refund names: cancellation provenance, ownership, eligibility, amount, duplicates and payroll review', async () => {
  const h = await setup()
  try {
    const { id } = await book(h, h.client, new Date(Date.parse(today() + 'T00:00:00Z') + 3 * 86400000).toISOString().slice(0, 10))
    await h.team(() => bookings.updateClientBookingStatus(id, 'Confirmed'))
    await pay(h, id)
    await h.team(() => core.confirmFromPayment(id))
    await assert.rejects(h.client(() => bookings.requestBookingRefund(id, 'GCash', 'Test 09123456789')), /confirmed/)
    await assert.rejects(h.rival(() => bookings.updateClientBookingStatus(id, 'Cancelled')), /not found/)
    await h.team(() => bookings.updateClientBookingStatus(id, 'Cancelled'))
    assert.equal((await h.admin(() => bookings.getAllBookings())).find(b => b.id === id).cancelledBy, 'provider')
    await assert.rejects(h.other(() => bookings.requestBookingRefund(id, 'GCash', 'Test 09123456789')), /not found/)
    await h.client(() => bookings.requestBookingRefund(id, 'GCash', 'Test 09123456789'))
    assert.equal((await h.client(() => bookings.getClientBookings()))[0].refund.amount, 1500)
    await assert.rejects(h.client(() => bookings.requestBookingRefund(id, 'GCash', 'Test 09123456789')), /Cannot/)
    await assert.rejects(h.client(() => bookings.reviewBookingRefund(id, 'Paid', 'TRANSFER-1')), /permission/)
    await assert.rejects(h.admin(() => bookings.reviewBookingRefund(id, 'Paid', 'TRANSFER-1')), /permission/)
    await assert.rejects(h.pm(() => bookings.reviewBookingRefund(id, 'Paid', '')), /reference/)
    await h.pm(() => bookings.reviewBookingRefund(id, 'Paid', 'TRANSFER-1'))
    const refunded = (await h.pm(() => bookings.getAllBookings())).find(b => b.id === id)
    assert.deepEqual([refunded.status, refunded.refund.status, refunded.refund.reference], ['refunded', 'Paid', 'TRANSFER-1'])
    await assert.rejects(h.pm(() => bookings.reviewBookingRefund(id, 'Paid', 'TRANSFER-2')), /no longer pending/)
    // A client's own cancellation of an unpaid booking does not qualify.
    const unpaid = (await book(h, h.client, new Date(Date.parse(today() + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10))).id
    assert.equal((await h.client(() => bookings.updateClientBookingStatus(unpaid, 'Cancelled'))).status, 'cancelled')
    await assert.rejects(h.client(() => bookings.requestBookingRefund(unpaid, 'GCash', 'Test 09123456789')), /Only paid events/)
  } finally { await h.db.close() }
})
