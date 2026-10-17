const { readFileSync } = require('node:fs')
const { transpileModule, ModuleKind } = require('typescript')
const assert = require('node:assert/strict')
const Module = require('node:module')
const values = new Map()
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), key: index => [...values.keys()][index], get length() { return values.size } }
global.window = { dispatchEvent() {} }
let actor = { role: 'client', email: 'client@example.com' }
const file = new Module('events-test')
file.require = name => name === "../runtime" ? { storage: global.localStorage, session: global.sessionStorage, events: global.window } : name === './client-auth' ? { getAccount: () => actor } : name === './marketplace-billing' ? { recordMarketplaceAction() {}, recordAdminAction() {} } : require(name)
file._compile(transpileModule(readFileSync('lib/server/domain/client-bookings.ts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, 'events-test.js')
const bookings = file.exports
bookings.saveClientBooking({ id: 'BK-1', provider: 'Event Team', status: 'Pending' })
assert.throws(() => bookings.submitEventFeedback('BK-1', 5, 'Great event'))
assert.throws(() => bookings.updateClientBookingStatus('BK-1', 'Completed'))
actor = { role: 'provider', business: 'Event Team' }
assert.throws(() => bookings.updateClientBookingStatus('BK-1', 'Completed'))
bookings.updateClientBookingStatus('BK-1', 'Confirmed')
actor.business = 'Other Team'
assert.throws(() => bookings.updateClientBookingStatus('BK-1', 'Completed'))
actor.business = 'Event Team'
bookings.updateClientBookingStatus('BK-1', 'Completed')
const completed = bookings.getAllBookings()[0]
assert.ok(completed.completedAt)
bookings.updateClientBookingStatus('BK-1', 'Completed')
assert.equal(bookings.getAllBookings()[0].completedAt, completed.completedAt)
assert.throws(() => bookings.updateClientBookingStatus('BK-1', 'Cancelled'))
assert.throws(() => bookings.submitEventFeedback('BK-1', 5, 'Great event'))
actor = { role: 'client', email: 'other@example.com' }
assert.equal(bookings.getClientBookings().length, 0)
assert.throws(() => bookings.submitEventFeedback('BK-1', 5, 'Great event'))
actor.email = 'client@example.com'
assert.throws(() => bookings.submitEventFeedback('BK-1', 0, 'Great event'))
assert.throws(() => bookings.submitEventFeedback('BK-1', 5, '   '))
bookings.submitEventFeedback('BK-1', 5, ' Great event ')
assert.equal(bookings.getClientBookings()[0].feedback.comment, 'Great event')
assert.throws(() => bookings.submitEventFeedback('BK-1', 4, 'Again'))
actor = { role: 'admin' }
assert.equal(bookings.getClientBookings()[0].status, 'Completed')
assert.equal(bookings.getClientBookings()[0].feedback.rating, 5)
console.log('Event checks passed: provider ownership, status transitions, completion persistence, client isolation, feedback validation and duplicate prevention.')

actor = { role: 'client', email: 'refund@example.com' }
bookings.saveClientBooking({ id: 'BK-R', provider: 'Event Team', status: 'Confirmed', paid: true, downpayment: 1500 })
assert.throws(() => bookings.requestBookingRefund('BK-R', 'GCash', 'Test 09123456789'))
actor = { role: 'provider', business: 'Other Team' }
assert.throws(() => bookings.updateClientBookingStatus('BK-R', 'Cancelled'))
actor.business = 'Event Team'
bookings.updateClientBookingStatus('BK-R', 'Cancelled')
assert.equal(bookings.getAllBookings().find(b => b.id === 'BK-R').cancelledBy, 'provider')
actor = { role: 'client', email: 'other@example.com' }
assert.throws(() => bookings.requestBookingRefund('BK-R', 'GCash', 'Test 09123456789'))
actor.email = 'refund@example.com'
bookings.requestBookingRefund('BK-R', 'GCash', 'Test 09123456789')
assert.equal(bookings.getClientBookings()[0].refund.amount, 1500)
assert.throws(() => bookings.requestBookingRefund('BK-R', 'GCash', 'Test 09123456789'))
assert.throws(() => bookings.reviewBookingRefund('BK-R', 'Paid', 'TRANSFER-1'))
actor = { role: 'admin' }
assert.throws(() => bookings.reviewBookingRefund('BK-R', 'Paid', ''))
bookings.reviewBookingRefund('BK-R', 'Paid', 'TRANSFER-1')
assert.equal(bookings.getAllBookings().find(b => b.id === 'BK-R').refund.reference, 'TRANSFER-1')
assert.throws(() => bookings.reviewBookingRefund('BK-R', 'Paid', 'TRANSFER-2'))
actor = { role: 'client', email: 'refund@example.com' }
bookings.saveClientBooking({ id: 'BK-C', provider: 'Event Team', status: 'Confirmed', paid: true, downpayment: 1500 })
bookings.updateClientBookingStatus('BK-C', 'Cancelled')
assert.throws(() => bookings.requestBookingRefund('BK-C', 'GCash', 'Test 09123456789'))
console.log('Refund checks passed: cancellation provenance, ownership, eligibility, amount, duplicate requests, admin review and payout reference.')
