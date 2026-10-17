const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createHmac } = require('node:crypto')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist')

process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture'
process.env.PAYMONGO_WEBHOOK_SECRET = 'whsec_fixture'

async function setup({ failConfirm = false } = {}) {
  const db = new PGlite({ extensions: { btree_gist } })
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('database/schema.sql', 'utf8'))
  const tag = connection => {
    const query = async (parts, ...values) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), values)).rows
    query.json = value => JSON.stringify(value)
    return query
  }
  const sql = { begin: callback => db.transaction(tx => callback(tag(tx))) }
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
  const records = {
    'soundstage-accounts-v2': JSON.stringify([{ role: 'provider', email: 'provider@test.com', application: { status: 'Approved' } }]),
    'soundstage-provider-services-v2:provider%40test.com': JSON.stringify([{ id: 'svc-1', name: 'Pro Sound', price: 10000, location: 'Manila', coverageAreas: 'Manila', active: true }]),
    'soundstage-marketplace-v1': JSON.stringify({ subscriptions: [{ email: 'provider@test.com', plan: 'Starter', trialEnd: new Date(Date.now() - 86400000).toISOString() }], payments: [], audit: [] }),
  }
  for (const [key, value] of Object.entries(records)) await db.query('INSERT INTO soundstage.records(key,value) VALUES ($1,$2)', [key, value])
  const direct = fn => db.transaction(async connection => {
    const values = Object.fromEntries((await connection.query('SELECT key, value FROM soundstage.records')).rows.map(r => [r.key, JSON.stringify(r.value)]))
    return runtime.context.run({ storage: new MemoryStorage(values), session: new MemoryStorage(), tx: tag(connection) }, fn)
  })
  const one = async (q, args) => (await db.query(q, args)).rows
  return { db, core, webhook, direct, one }
}

const day = offset => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10)
const client = { id: 'user_client', email: 'client@test.com', role: 'client' }
const provider = { id: 'user_provider', email: 'provider@test.com', role: 'provider' }
let n = 0
async function awaitingBooking(h, offset) {
  const { id } = await h.direct(() => h.core.createBooking(client, { packageId: 'svc-1', date: day(offset), durationDays: 1, eventTown: 'Manila' }, 'wk-' + ++n))
  await h.direct(() => h.core.transition(id, 'accepted', provider))
  return id
}
async function payment(h, { target = 'b', kind = 'booking', type = 'downpayment', amount = 3000, plan = null, owner = 'client@test.com' } = {}) {
  const session = 'cs_test_' + ++n
  const [row] = await h.one(`INSERT INTO soundstage.payments (target_kind, target_id, owner_email, type, plan, amount, checkout_session_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [kind, target, owner, type, plan, amount, session])
  return { id: row.id, session }
}
const sign = (body, t = Math.floor(Date.now() / 1000), key = 'te') => `t=${t},${key}=` + createHmac('sha256', 'whsec_fixture').update(`${t}.${body}`).digest('hex')
const paidEvent = (p, extra = {}) => JSON.stringify({ data: { id: extra.eventId || 'evt_' + ++n, attributes: { type: 'checkout_session.payment.paid', livemode: false, data: { id: p.session, attributes: {
  reference_number: extra.reference ?? p.id, livemode: extra.livemode ?? false,
  payments: [{ id: 'pay_' + n, attributes: { status: 'paid', currency: 'PHP', amount: extra.cents ?? 300000, source: { type: 'gcash' } } }] } } } } })
const post = (h, body, header = sign(body)) => h.webhook.handleWebhook(body, header)
const statusOf = async (h, table, id) => (await h.one(`SELECT status FROM soundstage.${table} WHERE id=$1`, [id]))[0].status

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
    assert.equal((await h.one('SELECT * FROM soundstage.payment_events')).length, 0)
    assert.equal(await statusOf(h, 'payments', p.id), 'pending')
  } finally { await h.db.close() }
})

test('an exact paid event confirms the booking once; duplicates change nothing (AC9, AC10, AC12, AC15, booking AC19)', async () => {
  const h = await setup()
  try {
    const booking = await awaitingBooking(h, 20)
    const p = await payment(h, { target: booking })
    const body = paidEvent(p, { eventId: 'evt_once' })
    assert.equal((await post(h, body)).status, 200)
    assert.equal(await statusOf(h, 'payments', p.id), 'paid')
    assert.equal(await statusOf(h, 'bookings', booking), 'confirmed')
    const [event] = await h.one('SELECT payment_id FROM soundstage.payment_events WHERE id=$1', ['evt_once'])
    assert.equal(event.payment_id, p.id)
    const history = async () => (await h.one('SELECT * FROM soundstage.booking_status_history WHERE booking_id=$1', [booking])).length
    const before = await history()
    assert.equal((await post(h, body)).status, 200)
    assert.equal((await post(h, paidEvent(p))).status, 200)
    assert.equal(await history(), before)
    const [last] = await h.one('SELECT new_status, actor_role FROM soundstage.booking_status_history WHERE booking_id=$1 ORDER BY id DESC LIMIT 1', [booking])
    assert.deepEqual(last, { new_status: 'confirmed', actor_role: 'system' })
  } finally { await h.db.close() }
})

test('mismatched or unknown paid events go to review and leave the booking alone (AC13)', async () => {
  const h = await setup()
  try {
    const booking = await awaitingBooking(h, 30)
    for (const extra of [{ cents: 299999 }, { livemode: true }, { reference: 'other' }]) {
      const p = await payment(h, { target: booking, type: 'downpayment' })
      assert.equal((await post(h, paidEvent(p, extra))).status, 200)
      assert.equal(await statusOf(h, 'payments', p.id), 'review')
      await h.one("UPDATE soundstage.payments SET status='failed' WHERE id=$1", [p.id])
    }
    assert.equal(await statusOf(h, 'bookings', booking), 'awaiting_payment')
    const unknown = paidEvent({ id: '00000000-0000-0000-0000-000000000000', session: 'cs_unknown' }, { eventId: 'evt_unknown' })
    assert.equal((await post(h, unknown)).status, 200)
    assert.equal((await h.one("SELECT * FROM soundstage.payment_events WHERE id='evt_unknown'")).length, 1)
  } finally { await h.db.close() }
})

test('a processing failure rolls back the event so PayMongo retries (AC11)', async () => {
  const h = await setup({ failConfirm: true })
  try {
    const booking = await awaitingBooking(h, 40)
    const p = await payment(h, { target: booking })
    const body = paidEvent(p, { eventId: 'evt_retry' })
    assert.equal((await post(h, body)).status, 503)
    assert.equal((await h.one("SELECT * FROM soundstage.payment_events WHERE id='evt_retry'")).length, 0)
    assert.equal(await statusOf(h, 'payments', p.id), 'pending')
    h.core.restore()
    assert.equal((await post(h, body)).status, 200)
    assert.equal(await statusOf(h, 'bookings', booking), 'confirmed')
  } finally { await h.db.close() }
})

test('payment.failed marks a pending payment failed so a new checkout can start (AC14)', async () => {
  const h = await setup()
  try {
    const p = await payment(h)
    const body = JSON.stringify({ data: { id: 'evt_fail', attributes: { type: 'payment.failed', data: { id: 'pay_x', attributes: { external_reference_number: p.id } } } } })
    assert.equal((await post(h, body)).status, 200)
    assert.equal(await statusOf(h, 'payments', p.id), 'failed')
    const again = await payment(h)
    assert.ok(again.id)
    const other = JSON.stringify({ data: { id: 'evt_other', attributes: { type: 'source.chargeable', data: {} } } })
    assert.equal((await post(h, other)).status, 200)
    assert.equal((await h.one("SELECT * FROM soundstage.payment_events WHERE id='evt_other'")).length, 1)
  } finally { await h.db.close() }
})

test('a payment after the hold expired goes to review and the booking stays cancelled (AC16)', async () => {
  const h = await setup()
  try {
    const booking = await awaitingBooking(h, 50)
    const p = await payment(h, { target: booking })
    await h.one("UPDATE soundstage.bookings SET hold_expires_at = now() - interval '1 hour' WHERE id=$1", [booking])
    assert.equal((await post(h, paidEvent(p))).status, 200)
    assert.equal(await statusOf(h, 'bookings', booking), 'cancelled')
    const [row] = await h.one('SELECT status, review_reason FROM soundstage.payments WHERE id=$1', [p.id])
    assert.deepEqual(row, { status: 'review', review_reason: 'hold_expired' })
  } finally { await h.db.close() }
})

test('a subscription payment activates once (AC19)', async () => {
  const h = await setup()
  try {
    const p = await payment(h, { kind: 'subscription', target: 'provider@test.com', owner: 'provider@test.com', type: 'subscription', amount: 3000, plan: 'Pro' })
    const body = paidEvent(p, { eventId: 'evt_sub' })
    assert.equal((await post(h, body)).status, 200)
    assert.equal((await post(h, body)).status, 200)
    const [{ value }] = await h.one("SELECT value FROM soundstage.records WHERE key='soundstage-marketplace-v1'")
    assert.equal(value.subscriptions[0].plan, 'Pro')
    assert.equal(value.payments.length, 1)
    assert.ok(Date.parse(value.subscriptions[0].paidUntil) > Date.now() + 29 * 86400000)
  } finally { await h.db.close() }
})

test('no browser action can confirm a booking (booking AC18)', () => {
  const load = require('./helpers/ts-loader.cjs')()
  const { actions } = load('lib/server/data-service.ts')
  for (const name of Object.keys(actions)) assert.doesNotMatch(name, /confirmFromPayment|processEvent|handleWebhook|activateSubscription/)
  assert.doesNotMatch(readFileSync('lib/server/data-service.ts', 'utf8'), /confirmFromPayment/)
})
