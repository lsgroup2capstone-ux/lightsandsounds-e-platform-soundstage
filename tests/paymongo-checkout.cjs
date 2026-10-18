const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { openDatabase, seed } = require('./helpers/seed.cjs')
const tables = require('./helpers/record-tables.cjs')

async function setup({ paymongo } = {}) {
  const db = await openDatabase()
  const ids = await seed(db, { users: [{ email: 'client@test.com', role: 'client' }, { email: 'provider@test.com', role: 'provider' }], packages: [{ key: 'svc-1', provider: 'provider@test.com' }] })
  const records = await tables.readRecords(db)
  const tag = connection => {
    const query = async (parts, ...values) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), values)).rows
    query.json = value => JSON.stringify(value)
    return query
  }
  const fixture = require('./helpers/paymongo-fixture.cjs')()
  const calls = []
  const stub = paymongo || {
    ...fixture,
    createCheckout: async (...args) => { calls.push(args); return fixture.createCheckout(...args) },
    paymongo: async (...args) => { calls.push(['api', ...args]); return fixture.paymongo(...args) },
  }
  const load = require('./helpers/ts-loader.cjs')({ [path.resolve('lib/server/payments/paymongo.ts')]: stub })
  const core = load('lib/server/bookings/core.ts')
  load('lib/server/payments/ledger.ts')
  const checkout = load('lib/server/payments/checkout.ts')
  const runtime = load('lib/server/runtime.ts')
  const { MemoryStorage } = load('lib/data/memory-storage.ts')
  const direct = fn => db.transaction(connection => runtime.context.run({ storage: new MemoryStorage(records), session: new MemoryStorage(), tx: tag(connection) }, fn))
  const one = async (q, args) => (await db.query(q, args)).rows
  return { db, core, checkout, direct, one, calls, ids }
}

const day = offset => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10)
const client = { id: 'client@test.com', email: 'client@test.com', role: 'client' }
const outsider = { id: 'other@test.com', email: 'other@test.com', role: 'client' }
const provider = { id: 'provider@test.com', email: 'provider@test.com', role: 'provider' }
const admin = { id: 'admin@test.com', email: 'admin@test.com', role: 'admin' }
let n = 0
async function booking(h, status = 'awaiting_payment') {
  const { id } = await h.direct(() => h.core.createBooking(client, { packageId: h.ids['svc-1'], date: day(10 + ++n * 3), durationDays: 1, eventTown: 'Manila' }, 'ck-' + n))
  if (status !== 'pending') await h.direct(() => h.core.transition(id, 'accepted', provider))
  return id
}
const pay = (h, actor, ...args) => h.direct(() => h.checkout.startBookingPayment(actor, ...args))
const paid = (h, paymentId) => h.one("UPDATE soundstage.payments SET payment_status = 'paid' WHERE payment_id = $1", [paymentId])

test('a downpayment checkout uses the server amount and is stored pending (AC3)', async () => {
  const h = await setup()
  try {
    const id = await booking(h)
    const result = await pay(h, client, id, 'downpayment', 'GCash')
    assert.match(result.checkoutUrl, /^https:\/\/checkout\.paymongo\.com\//)
    const [row] = await h.one('SELECT booking_id::text, subscription_id, user_id::text, payment_type, amount::float AS amount, payment_status, checkout_session_id FROM soundstage.payments WHERE payment_id = $1', [result.id])
    assert.deepEqual(row, { booking_id: id, subscription_id: null, user_id: h.ids['client@test.com'], payment_type: 'downpayment', amount: 3000, payment_status: 'pending', checkout_session_id: 'cs_' + result.id })
    // The PayMongo reference is the payment id the webhook matches on.
    assert.equal(h.calls[0][0], result.id)
    assert.equal(h.calls[0][2], 3000)
    const full = await pay(h, client, await booking(h), 'full', 'Maya')
    assert.equal((await h.one('SELECT amount::float AS a FROM soundstage.payments WHERE payment_id = $1', [full.id]))[0].a, 10000)
  } finally { await h.db.close() }
})

test('wrong owner, status, type or a second downpayment create no checkout (AC4)', async () => {
  const h = await setup()
  try {
    const id = await booking(h)
    await assert.rejects(pay(h, outsider, id, 'downpayment', 'GCash'), /not found/)
    await assert.rejects(pay(h, provider, id, 'downpayment', 'GCash'), /permission/)
    await assert.rejects(pay(h, client, id, 'balance', 'GCash'), /No balance/)
    await assert.rejects(pay(h, client, id, 'tip', 'GCash'), /payment type/)
    await assert.rejects(pay(h, client, await booking(h, 'pending'), 'downpayment', 'GCash'), /pending/)
    assert.equal(h.calls.length, 0)
    const first = await pay(h, client, id, 'downpayment', 'GCash')
    await paid(h, first.id)
    await assert.rejects(pay(h, client, id, 'downpayment', 'GCash'), /already has a payment/)
    assert.equal(h.calls.length, 1)
    // A confirmed booking may pay the rest as a balance.
    await h.direct(() => h.core.confirmFromPayment(id))
    const balance = await pay(h, client, id, 'balance', 'GCash')
    assert.equal((await h.one('SELECT amount::float AS a FROM soundstage.payments WHERE payment_id = $1', [balance.id]))[0].a, 7000)
  } finally { await h.db.close() }
})

test('the action refuses a client-supplied amount (AC4)', async () => {
  const load = require('./helpers/ts-loader.cjs')({ [path.resolve('lib/server/payments/paymongo.ts')]: require('./helpers/paymongo-fixture.cjs')() })
  const { context } = load('lib/server/runtime.ts')
  const { MemoryStorage } = load('lib/data/memory-storage.ts')
  const { actions } = load('lib/server/data-service.ts')
  const state = { storage: new MemoryStorage(), session: new MemoryStorage() }
  state.storage.setItem('soundstage-accounts-v2', JSON.stringify([{ role: 'client', email: 'client@test.com' }]))
  state.session.setItem('soundstage-session', JSON.stringify({ role: 'client', email: 'client@test.com' }))
  await context.run(state, () => assert.throws(() => actions.startBookingPayment('00000000-0000-0000-0000-000000000000', 'downpayment', 'GCash', 1), /Invalid input/))
})

test('a repeat request reuses the open checkout (AC5)', async () => {
  const h = await setup()
  try {
    const id = await booking(h)
    const first = await pay(h, client, id, 'downpayment', 'GCash')
    assert.deepEqual(await pay(h, client, id, 'downpayment', 'Maya'), first)
    assert.equal(h.calls.length, 1)
  } finally { await h.db.close() }
})

test('a PayMongo error or foreign checkout host stores nothing (AC6)', async () => {
  for (const createCheckout of [async () => { throw new Error('PayMongo could not process the request.') }, async id => ({ id: 'cs_' + id, attributes: { checkout_url: 'https://evil.com/pay' } })]) {
    const h = await setup({ paymongo: { createCheckout, paymongo: async () => ({}), paymentKey: () => 'sk_test_x' } })
    try {
      const id = await booking(h)
      await assert.rejects(pay(h, client, id, 'downpayment', 'GCash'), error => error.status === 503 && /try again/.test(error.message))
      assert.equal((await h.one('SELECT count(*)::int AS n FROM soundstage.payments'))[0].n, 0)
    } finally { await h.db.close() }
  }
})

test('missing or malformed keys refuse checkout with a non-secret message (AC2)', async () => {
  const saved = process.env.PAYMONGO_SECRET_KEY
  const h = await setup({ paymongo: require('./helpers/ts-loader.cjs')()('lib/server/payments/paymongo.ts') })
  try {
    const id = await booking(h)
    for (const key of [undefined, 'pk_test_wrong']) {
      if (key === undefined) delete process.env.PAYMONGO_SECRET_KEY; else process.env.PAYMONGO_SECRET_KEY = key
      await assert.rejects(pay(h, client, id, 'downpayment', 'GCash'), error => error.status === 503 && !/sk_|pk_/.test(error.message))
    }
    assert.equal((await h.one('SELECT count(*)::int AS n FROM soundstage.payments'))[0].n, 0)
  } finally { if (saved === undefined) delete process.env.PAYMONGO_SECRET_KEY; else process.env.PAYMONGO_SECRET_KEY = saved; await h.db.close() }
})

test('status is owner-only and read-only; cancelling expires and never pays (AC17, AC18)', async () => {
  const h = await setup()
  try {
    const id = await booking(h)
    const started = await pay(h, client, id, 'downpayment', 'GCash')
    await assert.rejects(h.direct(() => h.checkout.getPaymentStatus(outsider, started.id)), /not found/)
    await assert.rejects(h.direct(() => h.checkout.getPaymentStatus(client, 'not-a-uuid')), /not found/)
    assert.deepEqual(await h.direct(() => h.checkout.getPaymentStatus(client, started.id)), { status: 'pending', kind: 'booking', checkoutUrl: started.checkoutUrl })
    assert.equal((await h.direct(() => h.checkout.getPaymentStatus(admin, started.id))).status, 'pending')
    for (const status of ['paid', 'failed', 'review']) {
      await h.one('UPDATE soundstage.payments SET payment_status = $2 WHERE payment_id = $1', [started.id, status])
      assert.deepEqual(await h.direct(() => h.checkout.getPaymentStatus(client, started.id)), { status, kind: 'booking' })
    }
    await h.one("UPDATE soundstage.payments SET payment_status = 'pending' WHERE payment_id = $1", [started.id])
    await assert.rejects(h.direct(() => h.checkout.cancelPayment(outsider, started.id)), /not found/)
    assert.deepEqual(await h.direct(() => h.checkout.cancelPayment(client, started.id)), { status: 'expired', kind: 'booking' })
    assert.deepEqual(h.calls.at(-1), ['api', '/cs_' + started.id + '/expire', undefined, 'POST'])
    assert.equal((await h.one('SELECT status FROM soundstage.bookings WHERE booking_id = $1', [id]))[0].status, 'awaiting_payment')
    assert.equal((await h.one("SELECT count(*)::int AS n FROM soundstage.payments WHERE payment_status = 'paid'"))[0].n, 0)
  } finally { await h.db.close() }
})

test('no browser action settles a payment from the return flow (AC17)', () => {
  const source = readFileSync('lib/server/data-service.ts', 'utf8')
  assert.doesNotMatch(source, /verifyPayment|settlePayment|soundstage-paymongo:/)
  const page = readFileSync('app/(client)/payment/return/page.tsx', 'utf8')
  assert.match(page, /getPaymentStatus/)
  assert.doesNotMatch(page, /verifyPayment/)
  assert.match(page, /aria-live="polite"/)
})

test('amounts and confirmation use the booking total, not the one-day package price (D7 rev 4)', async () => {
  const h = await setup()
  try {
    const { id } = await h.direct(() => h.core.createBooking(client, { packageId: h.ids['svc-1'], date: day(200), durationDays: 2, eventTown: 'Manila' }, 'ck-total'))
    await h.direct(() => h.core.transition(id, 'accepted', provider))
    const [b] = await h.one('SELECT package_price::float AS price, total_amount::float AS total FROM soundstage.bookings WHERE booking_id = $1', [id])
    assert.equal(b.price, 10000)
    assert.equal(b.total, 13800)
    const down = await pay(h, client, id, 'downpayment', 'GCash')
    assert.equal((await h.one('SELECT amount::float AS a FROM soundstage.payments WHERE payment_id = $1', [down.id]))[0].a, 4140)
    // 30% of the package price alone is not enough to confirm.
    await h.one("UPDATE soundstage.payments SET amount = 3000, payment_status = 'paid' WHERE payment_id = $1", [down.id])
    assert.deepEqual(await h.direct(() => h.core.confirmFromPayment(id)), { confirmed: false, reason: 'insufficient' })
    await h.one('UPDATE soundstage.payments SET amount = 4140 WHERE payment_id = $1', [down.id])
    assert.deepEqual(await h.direct(() => h.core.confirmFromPayment(id)), { confirmed: true })
    const balance = await pay(h, client, id, 'balance', 'GCash')
    assert.equal((await h.one('SELECT amount::float AS a FROM soundstage.payments WHERE payment_id = $1', [balance.id]))[0].a, 9660)
  } finally { await h.db.close() }
})

test('a checkout still being started is not duplicated (review-2 m1, m2)', async () => {
  const h = await setup()
  try {
    const id = await booking(h)
    await h.one("INSERT INTO soundstage.payments (booking_id, user_id, payment_type, amount) VALUES ($1, $2, 'downpayment', 3000)", [id, h.ids['client@test.com']])
    await assert.rejects(pay(h, client, id, 'downpayment', 'GCash'), error => error.status === 409 && /already being started/.test(error.message))
    assert.equal(h.calls.length, 0)
    assert.equal((await h.one('SELECT count(*)::int AS n FROM soundstage.payments WHERE booking_id = $1', [id]))[0].n, 1)
  } finally { await h.db.close() }
})

test('paying exactly the charged downpayment confirms when 30% is not a whole peso (review-3 M1)', async () => {
  const h = await setup()
  try {
    const id = await booking(h)
    await h.one('UPDATE soundstage.bookings SET total_amount = 13801 WHERE booking_id = $1', [id])
    const down = await pay(h, client, id, 'downpayment', 'GCash')
    const [{ a }] = await h.one('SELECT amount::float AS a FROM soundstage.payments WHERE payment_id = $1', [down.id])
    assert.equal(a, 4140)
    await paid(h, down.id)
    assert.deepEqual(await h.direct(() => h.core.confirmFromPayment(id)), { confirmed: true })
  } finally { await h.db.close() }
})
