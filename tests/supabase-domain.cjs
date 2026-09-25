const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./ts-loader.cjs')()
const { context } = load('lib/server/runtime.ts')
const { MemoryStorage } = load('lib/memory-storage.ts')
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
test('server derives booking identity, price and status; checks collisions and ownership', () => {
  process.env.ENABLE_DEMO_PAYMENTS = 'true'
  const state = fixture()
  context.run(state, () => {
    const saved = actions.saveClientBooking(input)
    assert.equal(saved.total, 1000)
    assert.equal(saved.downpayment, 300)
    assert.equal(saved.client, 'Test Client')
    assert.equal(saved.provider, 'Events')
    assert.equal(saved.status, 'Pending')
    assert.notEqual(saved.id, 'forged')
    assert.match(saved.paymentMethod, /^DEMO:/)
    assert.equal(saved.time, '6:00 PM')
    assert.equal(saved.eventType, 'Wedding')
    assert.throws(() => actions.saveClientBooking(input), /already booked/)
    assert.throws(() => actions.updateClientBookingStatus(saved.id, 'Confirmed'), /only cancel/)
    state.session.setItem('soundstage-session', JSON.stringify(other))
    assert.throws(() => actions.updateClientBookingStatus(saved.id, 'Completed'), /not found/)
    assert.throws(() => actions.sendBookingMessage({ bookingId: saved.id, body: 'Spoof' }), /not found/)
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    actions.updateClientBookingStatus(saved.id, 'Confirmed')
    actions.updateClientBookingStatus(saved.id, 'Completed')
    assert.throws(() => actions.createWithdrawalRequest({ amount: 1, payoutMethod: 'GCash', payoutAccount: '12345' }), /verified balance/)
    state.session.setItem('soundstage-session', JSON.stringify(client))
    actions.submitEventFeedback(saved.id, 5, 'Great work')
    assert.throws(() => actions.submitEventFeedback(saved.id, 4, 'Again'), /already/)
  })
})
test('public/private snapshots exclude documents, customer bookings and billing', () => {
  process.env.ENABLE_DEMO_PAYMENTS = 'true'
  const state = fixture()
  context.run(state, () => {
    actions.saveClientBooking(input)
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
test('profile edits cannot elevate roles; date blocks are enforced by the server', () => {
  const state = fixture()
  context.run(state, () => {
    actions.updateClientAccount({ role: 'admin', application: { status: 'Approved' }, firstName: 'Updated' })
    assert.equal(JSON.parse(visibleRecords()['soundstage-accounts-v2']).find(a => a.email === client.email).role, 'client')
    assert.throws(() => actions.updateClientAccount({ email: 'stolen@test.com' }), /verification/)
    state.session.setItem('soundstage-session', JSON.stringify(provider))
    actions.toggleScheduleDate('2027-01-01')
    state.session.setItem('soundstage-session', JSON.stringify(client))
    assert.throws(() => actions.saveClientBooking(input), /blocked/)
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
test('demo checkout is disabled unless explicitly configured', () => {
  delete process.env.ENABLE_DEMO_PAYMENTS
  context.run(fixture(), () => assert.throws(() => actions.saveClientBooking(input), /not enabled/))
})
