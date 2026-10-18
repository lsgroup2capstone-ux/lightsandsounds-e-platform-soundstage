const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createHmac } = require('node:crypto')
const path = require('node:path')
const { openDatabase, seed } = require('./helpers/seed.cjs')
const tables = require('./helpers/record-tables.cjs')

process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture'
process.env.PAYMONGO_WEBHOOK_SECRET = 'whsec_fixture'

async function setup({ failConfirm = false } = {}) {
  const db = await openDatabase()
  const ids = await seed(db, { users: [{ email: 'client@test.com', role: 'client' }, { email: 'provider@test.com', role: 'provider' }], packages: [{ key: 'svc-1', provider: 'provider@test.com' }] })
  // The provider's trial ended yesterday.
  await db.query("INSERT INTO soundstage.subscriptions (provider_id, plan_type, price, start_date, end_date, status) VALUES ($1, 'Trial', 0, current_date - 8, current_date - 1, 'expired')", [ids['provider@test.com']])
  const sql = { begin: callback => db.transaction(tx => callback(tables.tag(tx))) }
  const load = require('./helpers/ts-loader.cjs')({ [path.resolve('lib/server/db/database.ts')]: { getDatabase: () => sql } })
  const core = load('lib/server/bookings/core.ts')
  if (failConfirm) {
    const real = core.confirmFromPayment
    core.confirmFromPayment = async () => { throw new Error('boom') }
    core.restore = () => { core.confirmFromPayment = real }
  }
  const webhook = load('lib/server/payments/webhook.ts')
  const runtime = load('lib/server/runtime.ts')
  const { MemoryStorage } = load('lib/data/memory-storage.ts')
  const direct = fn => db.transaction(async connection => runtime.context.run({ storage: new MemoryStorage(await tables.loadRecords(connection)), session: new MemoryStorage(), tx: tables.tag(connection) }, fn))
  const one = async (q, args) => (await db.query(q, args)).rows
  return { db, core, webhook, direct, one, ids }
}

const day = offset => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10)
const client = { id: 'user_client', email: 'client@test.com', role: 'client' }
const provider = { id: 'user_provider', email: 'provider@test.com', role: 'provider' }
let n = 0
async function awaitingBooking(h, offset) {
  const { id } = await h.direct(() => h.core.createBooking(client, { packageId: h.ids['svc-1'], date: day(offset), durationDays: 1, eventTown: 'Manila' }, 'wk-' + ++n))
  await h.direct(() => h.core.transition(id, 'accepted', provider))
  return id
}
// A checkout row as startCheckout leaves it; subscriptions get their pending plan first.
async function payment(h, { booking = null, type = 'downpayment', amount = 3000, plan = null } = {}) {
  const session = 'cs_test_' + ++n
  let subscription = null
  if (plan) [{ subscription_id: subscription }] = await h.one("INSERT INTO soundstage.subscriptions (provider_id, plan_type, price, start_date, end_date, status) VALUES ($1, $2, $3, current_date, current_date, 'pending') RETURNING subscription_id", [h.ids['provider@test.com'], plan, amount])
  if (!booking && !plan) booking = await awaitingBooking(h, 200 + n)
  const owner = plan ? h.ids['provider@test.com'] : h.ids['client@test.com']
  const [row] = await h.one(`INSERT INTO soundstage.payments (booking_id, subscription_id, user_id, payment_type, amount, checkout_session_id)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING payment_id`, [booking, subscription, owner, plan ? 'subscription' : type, amount, session])
  return { id: String(row.payment_id), session, booking }
}
const sign = (body, t = Math.floor(Date.now() / 1000), key = 'te') => `t=${t},${key}=` + createHmac('sha256', 'whsec_fixture').update(`${t}.${body}`).digest('hex')
const paidEvent = (p, extra = {}) => JSON.stringify({ data: { id: extra.eventId || 'evt_' + ++n, attributes: { type: 'checkout_session.payment.paid', livemode: false, data: { id: p.session, attributes: {
  reference_number: extra.reference ?? p.id, livemode: extra.livemode ?? false,
  payments: [{ id: 'pay_' + n, attributes: { status: 'paid', currency: 'PHP', amount: extra.cents ?? 300000, source: { type: 'gcash' } } }] } } } } })
const post = (h, body, header = sign(body)) => h.webhook.handleWebhook(body, header)
const paymentStatus = async (h, id) => (await h.one('SELECT payment_status FROM soundstage.payments WHERE payment_id=$1', [id]))[0].payment_status
const bookingStatus = async (h, id) => (await h.one('SELECT status FROM soundstage.bookings WHERE booking_id=$1', [id]))[0].status

test('both webhook URLs share one handler that verifies the raw body first (AC7, AC8)', async () => {
  const legacy = readFileSync('app/api/paymongo/webhook/route.ts', 'utf8')
  assert.match(legacy, /export \{ POST \} from "@\/app\/api\/webhooks\/paymongo\/route"/)
  const h = await setup()
  try {
    const p = await payment(h)
    const body = paidEvent(p)
    assert.equal((await post(h, body, null)).status, 401)
    assert.equal((await post(h, body, sign(body + ' '))).status, 401)
    assert.equal((await post(h, body, sign(body, Math.floor(Date.now() / 1000) - 1000))).status, 401)
    assert.equal((await post(h, body, sign(body, undefined, 'li'))).status, 401)
    assert.equal((await post(h, 'x'.repeat(1000001), sign('x'))).status, 413)
    assert.equal(await paymentStatus(h, p.id), 'pending')
  } finally { await h.db.close() }
})

test('an exact paid event confirms the booking once; duplicates change nothing (AC9, AC10, AC12, AC15, booking AC19)', async () => {
  const h = await setup()
  try {
    const booking = await awaitingBooking(h, 20)
    const p = await payment(h, { booking })
    const body = paidEvent(p, { eventId: 'evt_once' })
    assert.equal((await post(h, body)).status, 200)
    assert.equal(await paymentStatus(h, p.id), 'paid')
    assert.equal(await bookingStatus(h, booking), 'confirmed')
    const [row] = await h.one('SELECT payment_method, reference_number, paid_at IS NOT NULL AS paid FROM soundstage.payments WHERE payment_id=$1', [p.id])
    assert.deepEqual(row, { payment_method: 'DEMO: PayMongo test: gcash', reference_number: row.reference_number, paid: true })
    assert.match(row.reference_number, /^pay_/)
    const history = async () => (await h.one("SELECT count(*)::int AS n FROM soundstage.audit_log WHERE table_name='bookings' AND record_id=$1", [booking]))[0].n
    const before = await history()
    assert.equal((await post(h, body)).status, 200)
    assert.equal((await post(h, paidEvent(p))).status, 200)
    assert.equal(await history(), before)
    assert.equal(await paymentStatus(h, p.id), 'paid')
    const [last] = await h.one("SELECT new_value, actor_role FROM soundstage.audit_log WHERE table_name='bookings' AND record_id=$1 ORDER BY audit_id DESC LIMIT 1", [booking])
    assert.deepEqual(last, { new_value: 'confirmed', actor_role: 'system' })
  } finally { await h.db.close() }
})

test('mismatched or unknown paid events go to review and leave the booking alone (AC13)', async () => {
  const h = await setup()
  try {
    const booking = await awaitingBooking(h, 30)
    for (const extra of [{ cents: 299999 }, { livemode: true }, { reference: 'other' }]) {
      const p = await payment(h, { booking, type: 'downpayment' })
      assert.equal((await post(h, paidEvent(p, extra))).status, 200)
      assert.equal(await paymentStatus(h, p.id), 'review')
      await h.one("UPDATE soundstage.payments SET payment_status='failed' WHERE payment_id=$1", [p.id])
    }
    assert.equal(await bookingStatus(h, booking), 'awaiting_payment')
    const before = (await h.one('SELECT count(*)::int AS n FROM soundstage.payments'))[0].n
    assert.equal((await post(h, paidEvent({ id: '999999', session: 'cs_unknown' }))).status, 200)
    assert.equal((await h.one('SELECT count(*)::int AS n FROM soundstage.payments'))[0].n, before)
  } finally { await h.db.close() }
})

test('a processing failure rolls back so PayMongo retries (AC11)', async () => {
  const h = await setup({ failConfirm: true })
  try {
    const booking = await awaitingBooking(h, 40)
    const p = await payment(h, { booking })
    const body = paidEvent(p, { eventId: 'evt_retry' })
    assert.equal((await post(h, body)).status, 503)
    assert.equal(await paymentStatus(h, p.id), 'pending')
    h.core.restore()
    assert.equal((await post(h, body)).status, 200)
    assert.equal(await bookingStatus(h, booking), 'confirmed')
  } finally { await h.db.close() }
})

test('payment.failed marks a pending payment failed so a new checkout can start (AC14)', async () => {
  const h = await setup()
  try {
    const p = await payment(h)
    const body = JSON.stringify({ data: { id: 'evt_fail', attributes: { type: 'payment.failed', data: { id: 'pay_x', attributes: { external_reference_number: p.id } } } } })
    assert.equal((await post(h, body)).status, 200)
    assert.equal(await paymentStatus(h, p.id), 'failed')
    const again = await payment(h, { booking: p.booking })
    assert.ok(again.id)
    const other = JSON.stringify({ data: { id: 'evt_other', attributes: { type: 'source.chargeable', data: {} } } })
    assert.equal((await post(h, other)).status, 200)
  } finally { await h.db.close() }
})

test('a payment after the hold expired goes to review and the booking stays cancelled (AC16)', async () => {
  const h = await setup()
  try {
    const booking = await awaitingBooking(h, 50)
    const p = await payment(h, { booking })
    await h.one("UPDATE soundstage.bookings SET hold_expires_at = now() - interval '1 hour' WHERE booking_id=$1", [booking])
    assert.equal((await post(h, paidEvent(p))).status, 200)
    assert.equal(await bookingStatus(h, booking), 'cancelled')
    const [row] = await h.one('SELECT payment_status, review_reason FROM soundstage.payments WHERE payment_id=$1', [p.id])
    assert.deepEqual(row, { payment_status: 'review', review_reason: 'hold_expired' })
  } finally { await h.db.close() }
})

test('a subscription payment activates its plan once (AC19)', async () => {
  const h = await setup()
  try {
    const p = await payment(h, { plan: 'Pro', amount: 3000 })
    const body = paidEvent(p, { eventId: 'evt_sub' })
    assert.equal((await post(h, body)).status, 200)
    assert.equal((await post(h, body)).status, 200)
    const subs = await h.one("SELECT plan_type, status, end_date - start_date AS days FROM soundstage.subscriptions WHERE plan_type = 'Pro'")
    assert.deepEqual(subs, [{ plan_type: 'Pro', status: 'active', days: 30 }])
    const value = JSON.parse((await tables.readRecords(h.db))['soundstage-marketplace-v1'])
    assert.equal(value.subscriptions[0].plan, 'Pro')
    assert.deepEqual(value.payments.map(x => [x.plan, x.status]), [['Pro', 'Paid']])
    assert.ok(Date.parse(value.subscriptions[0].paidUntil) > Date.now() + 29 * 86400000)
  } finally { await h.db.close() }
})

test('no browser action can confirm a booking (booking AC18)', () => {
  const load = require('./helpers/ts-loader.cjs')()
  const { actions } = load('lib/server/data-service.ts')
  for (const name of Object.keys(actions)) assert.doesNotMatch(name, /confirmFromPayment|processEvent|handleWebhook|activateSubscription/)
  assert.doesNotMatch(readFileSync('lib/server/data-service.ts', 'utf8'), /confirmFromPayment/)
})
