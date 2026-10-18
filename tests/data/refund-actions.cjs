const { test } = require('node:test')
const assert = require('node:assert/strict')
const { openDatabase, seed, insertBooking } = require('../helpers/seed.cjs')
const tables = require('../helpers/record-tables.cjs')

// Refund requests and decisions on the refunds table (data dictionary Table 11).
async function setup() {
  const db = await openDatabase()
  const ids = await seed(db, { users: [{ email: 'c@test.com', role: 'client' }, { email: 'p@test.com', role: 'provider' }, { email: 'pm@test.com', role: 'payroll_master' }], packages: [{ key: 'pkg', provider: 'p@test.com' }] })
  const load = require('../helpers/ts-loader.cjs')()
  const runtime = load('lib/server/runtime.ts')
  load('lib/server/payments/ledger.ts')
  const compat = load('lib/server/bookings/compat.ts')
  const { MemoryStorage } = load('lib/data/memory-storage.ts')
  const run = fn => db.transaction(async tx => runtime.context.run({ storage: new MemoryStorage(await tables.loadRecords(tx)), session: new MemoryStorage(), tx: tables.tag(tx) }, fn))
  const one = async (q, args) => (await db.query(q, args)).rows
  // A paid booking the provider cancelled.
  const cancelledPaid = async (date, amounts) => {
    const id = await insertBooking(db, ids, { client: 'c@test.com', provider: 'p@test.com', pkg: 'pkg', date, status: 'cancelled' })
    await one("UPDATE soundstage.bookings SET cancelled_by = 'provider' WHERE booking_id = $1", [id])
    for (const [i, amount] of amounts.entries()) await one("INSERT INTO soundstage.payments (booking_id, user_id, payment_type, amount, payment_status, paid_at) VALUES ($1, $2, $3, $4, 'paid', now() + make_interval(mins => $5))", [id, ids['c@test.com'], i ? 'balance' : 'downpayment', amount, i])
    return id
  }
  return { db, ids, run, one, compat, cancelledPaid }
}
const client = { id: 'c@test.com', email: 'c@test.com', role: 'client' }
const payroll = { id: 'pm@test.com', email: 'pm@test.com', role: 'payroll_master' }

test('a refund request and a Paid decision record the refund, the payments and the booking (Table 11)', async () => {
  const h = await setup()
  try {
    const id = await h.cancelledPaid('2026-12-01', [3000, 7000])
    await h.run(() => h.compat.requestRefund(client, id, 'GCash', '09171234567'))
    const [requested] = await h.one('SELECT status, amount::float AS amount, payout_method, payout_account, client_id::text FROM soundstage.refunds WHERE booking_id = $1', [id])
    assert.deepEqual(requested, { status: 'requested', amount: 10000, payout_method: 'GCash', payout_account: '09171234567', client_id: h.ids['c@test.com'] })
    await assert.rejects(h.run(() => h.compat.requestRefund(client, id, 'GCash', '09171234567')), /Cannot request a refund/)
    const view = await h.run(() => h.compat.getOwned(client, id))
    assert.deepEqual([view.refund.status, view.refund.amount, view.refund.method], ['Pending', 10000, 'GCash'])
    await assert.rejects(h.run(() => h.compat.reviewRefund(client, id, 'Paid', 'REF-1')), /permission/)
    await h.run(() => h.compat.reviewRefund(payroll, id, 'Paid', 'GC-REF-77'))
    const [done] = await h.one('SELECT status, reference_number, decided_by::text, completed_at IS NOT NULL AS completed FROM soundstage.refunds WHERE booking_id = $1', [id])
    assert.deepEqual(done, { status: 'completed', reference_number: 'GC-REF-77', decided_by: h.ids['pm@test.com'], completed: true })
    const payments = await h.one('SELECT payment_status, refunded_amount::float AS refunded FROM soundstage.payments WHERE booking_id = $1 ORDER BY paid_at', [id])
    assert.deepEqual(payments, [{ payment_status: 'refunded', refunded: 3000 }, { payment_status: 'refunded', refunded: 7000 }])
    assert.equal((await h.one('SELECT status FROM soundstage.bookings WHERE booking_id = $1', [id]))[0].status, 'refunded')
    assert.deepEqual((await h.one("SELECT action, actor_role FROM soundstage.audit_log WHERE table_name = 'refunds'")).map(r => [r.action, r.actor_role]), [['Refund completed', 'payroll_master']])
    const after = await h.run(() => h.compat.getOwned(client, id))
    assert.deepEqual([after.refund.status, after.refund.reference, after.paid], ['Paid', 'GC-REF-77', true])
    await assert.rejects(h.run(() => h.compat.reviewRefund(payroll, id, 'Rejected', 'Too late')), /no longer pending/)
  } finally { await h.db.close() }
})

test('a rejected refund returns the booking to cancelled with the remarks (Table 11)', async () => {
  const h = await setup()
  try {
    const id = await h.cancelledPaid('2026-12-05', [300])
    await h.run(() => h.compat.requestRefund(client, id, 'Maya', '09998887777'))
    await assert.rejects(h.run(() => h.compat.reviewRefund(payroll, id, 'Paid', 'X'.repeat(101))), /up to 100/)
    await h.run(() => h.compat.reviewRefund(payroll, id, 'Rejected', 'Outside policy'))
    assert.deepEqual((await h.one('SELECT status, remarks FROM soundstage.refunds WHERE booking_id = $1', [id]))[0], { status: 'rejected', remarks: 'Outside policy' })
    assert.equal((await h.one('SELECT status FROM soundstage.bookings WHERE booking_id = $1', [id]))[0].status, 'cancelled')
    assert.deepEqual((await h.one('SELECT payment_status, refunded_amount::float AS r FROM soundstage.payments WHERE booking_id = $1', [id]))[0], { payment_status: 'paid', r: 0 })
    const view = await h.run(() => h.compat.getOwned(client, id))
    assert.deepEqual([view.refund.status, view.refund.reason, view.refundEligible], ['Rejected', 'Outside policy', undefined])
  } finally { await h.db.close() }
})
