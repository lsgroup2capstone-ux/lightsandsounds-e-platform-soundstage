const { test } = require('node:test')
const assert = require('node:assert/strict')
const paymongoFixture = require('../helpers/paymongo-fixture.cjs')()
const load = require('../helpers/ts-loader.cjs')({ [require('node:path').resolve('lib/server/payments/paymongo.ts')]: paymongoFixture })
const { context } = load('lib/server/runtime.ts')
const { MemoryStorage } = load('lib/data/memory-storage.ts')
const { actions, visibleRecords, RequestError } = load('lib/server/data-service.ts')
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
  process.env.ENABLE_DEMO_PAYMENTS = 'true'
  const state = fixture()
  await context.run(state, async () => {
    const checkout = await actions.saveClientBooking(input)
    const saved = JSON.parse(state.storage.getItem('soundstage-client-bookings-v3:client%40test.com'))[0]
    assert.equal(saved.paid, false)
    await actions.verifyPayment(checkout.id)
    assert.equal(saved.total, 1000)
    assert.equal(saved.downpayment, 300)
    assert.equal(saved.client, 'Test Client')
    assert.equal(saved.provider, 'Events')
    assert.equal(saved.status, 'Pending')
    assert.notEqual(saved.id, 'forged')
    assert.match(saved.paymentMethod, /^PayMongo:/)
    assert.equal(saved.time, '6:00 PM')
    assert.equal(saved.eventType, 'Wedding')
    assert.deepEqual(actions.getBookingAvailability(service.id), [])
    assert.throws(() => actions.updateClientBookingStatus(saved.id, 'Confirmed'), /permission/)
    state.session.setItem('soundstage-session', JSON.stringify(other))
    assert.throws(() => actions.updateClientBookingStatus(saved.id, 'Completed'), /not found/)
    assert.throws(() => actions.sendBookingMessage({ bookingId: saved.id, body: 'Spoof' }), /not found/)
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    actions.updateClientBookingStatus(saved.id, 'Confirmed')
    assert.deepEqual(actions.getBookingAvailability(service.id), ['2027-01-01'])
    actions.updateClientBookingStatus(saved.id, 'Completed')
    assert.throws(() => actions.createWithdrawalRequest({ amount: 1, payoutMethod: 'GCash', payoutAccount: '12345' }), /verified balance/)
    state.session.setItem('soundstage-session', JSON.stringify(client))
    actions.submitEventFeedback(saved.id, 5, 'Great work')
    assert.throws(() => actions.submitEventFeedback(saved.id, 4, 'Again'), /already/)
  })
})
test('public/private snapshots exclude documents, customer bookings and billing', async () => {
  process.env.ENABLE_DEMO_PAYMENTS = 'true'
  const state = fixture()
  await context.run(state, async () => {
    await actions.saveClientBooking(input)
    state.session.clear()
    const anonymous = visibleRecords()
    assert.ok(anonymous[serviceKey])
    assert.equal(Object.keys(anonymous).some(k => k.startsWith('soundstage-client-bookings')), false)
    assert.equal(JSON.stringify(anonymous).includes('JVBERi0='), false)
    assert.equal(anonymous['soundstage-marketplace-v1'], undefined)
    state.session.setItem('soundstage-session', JSON.stringify({ ...client, email: 'unknown@test.com' }))
    assert.throws(() => actions.reviewProviderApplication(provider.email, 'Approved', ''), RequestError)
  })
})
test('profile edits cannot elevate roles; date blocks are enforced by the server', async () => {
  const state = fixture()
  await context.run(state, async () => {
    await actions.updateClientAccount({ role: 'admin', application: { status: 'Approved' }, firstName: 'Updated' })
    assert.equal(JSON.parse(visibleRecords()['soundstage-accounts-v2']).find(a => a.email === client.email).role, 'client')
    await assert.rejects(actions.updateClientAccount({ email: 'stolen@test.com' }), /verification/)
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    actions.toggleScheduleDate('2027-01-01')
    state.session.setItem('soundstage-session', JSON.stringify(client))
    await assert.rejects(actions.saveClientBooking(input), /blocked/)
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
test('subscription verification is idempotent and owner restricted', async () => {
  const state = fixture(provider)
  await context.run(state, async () => {
    const checkout = await actions.createSubscriptionCheckout('Pro', 'GCash')
    state.session.setItem('soundstage-session', JSON.stringify(other))
    await assert.rejects(actions.verifyPayment(checkout.id), /not found/)
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    await actions.verifyPayment(checkout.id)
    const first = state.storage.getItem('soundstage-marketplace-v1')
    await actions.verifyPayment(checkout.id)
    assert.equal(state.storage.getItem('soundstage-marketplace-v1'), first)
    assert.equal(JSON.parse(first).payments.length, 1)
  })
})

test('unpaid and incorrect amounts cannot settle; cancellation releases the booking', async () => {
  const state = fixture()
  await context.run(state, async () => {
    const checkout = await actions.saveClientBooking(input)
    const session = paymongoFixture.sessions.get('cs_' + checkout.id)
    session.attributes.payments[0].attributes.amount = 1
    assert.equal((await actions.verifyPayment(checkout.id)).paid, false)
    session.attributes.payments = []
    assert.equal((await actions.verifyPayment(checkout.id)).paid, false)
    const cancelled = await actions.cancelPayment(checkout.id)
    assert.equal(cancelled.cancelled, true)
    const booking = JSON.parse(state.storage.getItem('soundstage-client-bookings-v3:client%40test.com'))[0]
    assert.equal(booking.paid, false)
    assert.equal(booking.status, 'Cancelled')
    const next = await actions.saveClientBooking(input)
    assert.notEqual(next.id, checkout.id)
  })
})

test('availability blocks all provider packages and multi-day dates without exposing customer data', () => {
  const state = fixture(other)
  context.run(state, () => {
    state.storage.setItem(serviceKey, JSON.stringify([service, { ...service, id: 'service-2' }]))
    state.storage.setItem('soundstage-client-bookings-v3:client%40test.com', JSON.stringify([
      { ...input, id: 'private-booking', packageId: 'service-2', durationDays: 3, status: 'Confirmed', client: 'Private Customer' },
      { ...input, date: '2027-02-01', status: 'Cancelled' },
      { ...input, date: '2027-04-01', status: 'Pending', paid: true },
      { ...input, date: '2027-05-01', status: 'Pending', paid: false },
      { ...input, packageId: 'unrelated', date: '2027-03-01', status: 'Pending' },
    ]))
    state.storage.setItem('soundstage-schedule:provider%40test.com', JSON.stringify(['2027-01-10']))
    assert.deepEqual(actions.getBookingAvailability(service.id), ['2027-01-01', '2027-01-02', '2027-01-03', '2027-01-10'])
    assert.throws(() => actions.getBookingAvailability('missing'), /no longer available/)
  })
})
