const { test } = require('node:test')
const assert = require('node:assert/strict')
const paymongoFixture = require('../helpers/paymongo-fixture.cjs')()
const load = require('../helpers/ts-loader.cjs')({ [require('node:path').resolve('lib/server/payments/paymongo.ts')]: paymongoFixture })
const { context } = load('lib/server/runtime.ts')
const { MemoryStorage } = load('lib/data/memory-storage.ts')
const { actions, visibleRecords, RequestError } = load('lib/server/data-service.ts')
const { openDatabase, seed } = require('../helpers/seed.cjs')
// Bookings and checkouts live in the tables, so actions run with a transaction over seeded users and packages.
let database, ids
async function withTx(state) {
  if (!database) {
    database = await openDatabase()
    ids = await seed(database, {
      users: [{ email: 'client@test.com', role: 'client', first: 'Test', last: 'Client' }, { email: 'provider@test.com', role: 'provider', business: 'Events' }, { email: 'other@test.com', role: 'provider', business: 'Other' }, { email: 'admin@test.com', role: 'admin' }],
      packages: [{ key: 'service-1', provider: 'provider@test.com', name: 'Lights', price: 1000, location: 'Balayan' }, { key: 'service-2', provider: 'provider@test.com', name: 'Lights', price: 1000, location: 'Balayan' }],
    })
    service.id = input.packageId = ids['service-1']
    state.storage.setItem(serviceKey, JSON.stringify([service]))
  }
  state.tx = async (parts, ...values) => (await database.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), values)).rows
  return state
}
const core = () => load('lib/server/bookings/core.ts')
const shift = days => new Date(Date.parse(core().manilaToday() + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
let keys = 0
const book = (extra = {}) => actions.saveClientBooking({ ...input, idempotencyKey: 'sd-' + ++keys, ...extra })
const paid = (id, amount, method = 'DEMO: PayMongo test: gcash') => database.query("INSERT INTO soundstage.payments (booking_id, user_id, payment_type, amount, payment_status, payment_method) VALUES ($1, $2, 'downpayment', $3, 'paid', $4)", [id, ids['client@test.com'], amount, method])
const ownView = async () => JSON.parse((await visibleRecords())['soundstage-client-bookings-v3:client%40test.com'] || '[]')
const docs = [{ name: 'permit.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0=' }]
const client = { role: 'client', email: 'client@test.com', firstName: 'Test', lastName: 'Client', mobile: '123', authMethod: 'email' }
const provider = { ...client, role: 'provider', email: 'provider@test.com', business: 'Events', application: { status: 'Approved', documents: docs, submittedAt: '2026-01-01' } }
const other = { ...provider, email: 'other@test.com', business: 'Other' }
const admin = { ...client, role: 'admin', email: 'admin@test.com' }
const service = { id: 'service-1', name: 'Lights', providerName: 'Events', active: true, price: 1000, location: 'Balayan', coverageAreas: 'Balayan', transportationFee: 0, description: '', image: '', bookings: 0 }
const serviceKey = 'soundstage-provider-services-v2:provider%40test.com'
function fixture(actor = client) {
  const state = { storage: new MemoryStorage(), session: new MemoryStorage() }
  state.storage.setItem('soundstage-accounts-v2', JSON.stringify([client, provider, other, admin]))
  state.storage.setItem('soundstage-admin-account', JSON.stringify(admin))
  state.storage.setItem(serviceKey, JSON.stringify([service]))
  state.storage.setItem('soundstage-marketplace-v1', JSON.stringify({ subscriptions: [{ email: provider.email, trialStart: new Date().toISOString(), trialEnd: '2099-01-01' }], payments: [], audit: [] }))
  state.session.setItem('soundstage-session', JSON.stringify(actor))
  return state
}
const input = { id: 'forged', packageId: service.id, provider: 'Other', client: 'Fake', date: '2027-01-01', time: '6:00 PM', eventType: 'Wedding', location: 'Venue', eventTown: 'Balayan', guests: 10, durationDays: 1, total: 1, downpayment: 1, paid: true, status: 'Completed', paymentMethod: 'GCash' }
test('server derives booking identity, price and status; checks collisions and ownership', async () => {
  const state = await withTx(fixture())
  await context.run(state, async () => {
    const today = shift(0)
    const { id } = await book({ date: today })
    assert.notEqual(id, 'forged')
    const saved = (await ownView()).find(b => b.id === id)
    assert.equal(saved.paid, false)
    assert.equal(saved.total, 1000)
    assert.equal(saved.downpayment, 300)
    assert.equal(saved.client, 'Test Client')
    assert.equal(saved.provider, 'Events')
    assert.equal(saved.status, 'pending')
    assert.equal(saved.time, '6:00 PM')
    assert.equal(saved.eventType, 'Wedding')
    assert.deepEqual(await actions.getBookingAvailability(service.id), [])
    await assert.rejects(actions.updateClientBookingStatus(id, 'Confirmed'), /Cannot accept/)
    state.session.setItem('soundstage-session', JSON.stringify(other))
    await assert.rejects(actions.updateClientBookingStatus(id, 'Completed'), /not found/)
    await assert.rejects(actions.sendBookingMessage({ bookingId: id, body: 'Spoof' }), /not found/)
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    assert.equal((await actions.updateClientBookingStatus(id, 'Confirmed')).status, 'awaiting_payment')
    assert.deepEqual(await actions.getBookingAvailability(service.id), [today])
    await paid(id, 300)
    assert.equal((await core().confirmFromPayment(id)).confirmed, true)
    await actions.updateClientBookingStatus(id, 'Completed')
    // Withdrawals are retired in favour of payouts released per booking.
    await assert.rejects(actions.createWithdrawalRequest({ amount: 1, payoutMethod: 'GCash', payoutAccount: '12345' }), /replaced by payouts/)
    state.session.setItem('soundstage-session', JSON.stringify(client))
    await actions.submitEventFeedback(id, 5, 'Great work')
    await assert.rejects(actions.submitEventFeedback(id, 4, 'Again'), /already/)
  })
})
test('public/private snapshots exclude documents, customer bookings and billing', async () => {
  const state = await withTx(fixture())
  await context.run(state, async () => {
    await book({ date: shift(40) })
    state.session.clear()
    const anonymous = await visibleRecords()
    assert.ok(anonymous[serviceKey])
    assert.equal(Object.keys(anonymous).some(k => k.startsWith('soundstage-client-bookings')), false)
    assert.equal(JSON.stringify(anonymous).includes('JVBERi0='), false)
    assert.equal(anonymous['soundstage-marketplace-v1'], undefined)
    state.session.setItem('soundstage-session', JSON.stringify({ ...client, email: 'unknown@test.com' }))
    assert.throws(() => actions.reviewProviderApplication(provider.email, 'Approved', ''), RequestError)
  })
})
test('profile edits cannot elevate roles; date blocks are enforced by the server', async () => {
  const state = await withTx(fixture())
  await context.run(state, async () => {
    await actions.updateClientAccount({ role: 'admin', application: { status: 'Approved' }, firstName: 'Updated' })
    assert.equal(JSON.parse((await visibleRecords())['soundstage-accounts-v2']).find(a => a.email === client.email).role, 'client')
    await assert.rejects(actions.updateClientAccount({ email: 'stolen@test.com' }), /verification/)
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    await actions.toggleScheduleDate(shift(60))
    state.session.setItem('soundstage-session', JSON.stringify(client))
    await assert.rejects(book({ date: shift(60) }), /blocked/)
  })
})
test('import strips passwords, refuses overwrite, and requires administrator', () => {
  const state = fixture(client)
  context.run(state, () => {
    assert.throws(() => actions.importLegacyRecords({}), /Administrator/)
    state.storage.clear()
    state.storage.setItem('soundstage-accounts-v2', JSON.stringify([admin]))
    state.storage.setItem('soundstage-admin-account', JSON.stringify(admin))
    state.session.setItem('soundstage-session', JSON.stringify(admin))
    const result = actions.importLegacyRecords({ 'soundstage-accounts-v2': JSON.stringify([{ ...client, password: 'plaintext' }]) })
    assert.equal(result.accounts, 1)
    assert.equal(JSON.stringify(state.storage.values).includes('plaintext'), false)
    assert.throws(() => actions.importLegacyRecords({}), /empty/)
  })
})
test('request state is isolated across concurrent users', async () => {
  await Promise.all([client, provider, admin].map(actor => context.run(fixture(actor), async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
    const auth = load('lib/server/domain/client-auth.ts')
    assert.equal(auth.getAccount().email, actor.email)
  })))
})
test('the return flow only reads payment status and never settles (payments AC17, AC18)', async () => {
  const state = await withTx(fixture(provider))
  await context.run(state, async () => {
    assert.equal(actions.verifyPayment, undefined)
    const checkout = await actions.createSubscriptionCheckout('Pro', 'GCash')
    assert.deepEqual(await actions.createSubscriptionCheckout('Pro', 'GCash'), checkout)
    state.session.setItem('soundstage-session', JSON.stringify(other))
    await assert.rejects(actions.getPaymentStatus(checkout.id), /not found/)
    await assert.rejects(actions.cancelPayment(checkout.id), /not found/)
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    const before = state.storage.getItem('soundstage-marketplace-v1')
    assert.deepEqual(await actions.getPaymentStatus(checkout.id), { status: 'pending', kind: 'subscription', checkoutUrl: checkout.checkoutUrl })
    assert.deepEqual(await actions.cancelPayment(checkout.id), { status: 'expired', kind: 'subscription' })
    assert.deepEqual(await actions.getPaymentStatus(checkout.id), { status: 'expired', kind: 'subscription' })
    assert.equal(state.storage.getItem('soundstage-marketplace-v1'), before)
    assert.notEqual((await actions.createSubscriptionCheckout('Pro', 'GCash')).id, checkout.id)
  })
})

test('availability blocks all provider packages and multi-day dates without exposing customer data', async () => {
  const state = await withTx(fixture(other))
  await context.run(state, async () => {
    state.storage.setItem(serviceKey, JSON.stringify([service, { ...service, id: ids['service-2'] }]))
    const insert = (start, days, status, packageKey = 'service-2', hold = null) => database.query(`INSERT INTO soundstage.bookings (client_id, provider_id, package_id, package_name, package_price, total_amount, event_date, duration_days, status, hold_expires_at)
      VALUES ($1, $2, $3, 'Private Customer package', 1000, 1000, $4::date, $5, $6, $7)`, [ids['client@test.com'], ids['provider@test.com'], ids[packageKey], start, days, status, hold])
    await insert(shift(100), 3, 'confirmed')
    await insert(shift(110), 1, 'cancelled', 'service-1')
    await insert(shift(120), 1, 'pending', 'service-1')
    await insert(shift(130), 1, 'awaiting_payment', 'service-1', new Date(Date.now() + 3600000).toISOString())
    await insert(shift(140), 1, 'awaiting_payment', 'service-1', new Date(Date.now() - 3600000).toISOString())
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    await actions.toggleScheduleDate(shift(150))
    state.session.setItem('soundstage-session', JSON.stringify(other))
    const dates = await actions.getBookingAvailability(service.id)
    for (const day of [shift(100), shift(101), shift(102), shift(130), shift(150)]) assert.ok(dates.includes(day), day)
    for (const day of [shift(103), shift(110), shift(120), shift(140)]) assert.equal(dates.includes(day), false, day)
    // Only dates leave the server; no booking details.
    assert.equal(JSON.stringify(dates).includes('Private Customer'), false)
    await assert.rejects(actions.getBookingAvailability('missing'), /no longer available/)
  })
})
