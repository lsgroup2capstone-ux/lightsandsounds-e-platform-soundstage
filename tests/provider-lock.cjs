const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const createLoader = require('./ts-loader.cjs')

const load = createLoader()
const { assertProviderActionAllowed, AWAITING_VERIFICATION } = load(path.resolve('lib/server/provider-lock.ts'))
const { hubNav, isProviderPathLocked } = load(path.resolve('lib/hub-data.ts'))

const denied = (fn) => assert.throws(fn, error => error.status === 403 && error.message === AWAITING_VERIFICATION)

test('unapproved provider is rejected on locked actions', () => {
  for (const action of ['saveProviderService', 'updateProviderServices', 'updateClientBookingStatus', 'createWithdrawalRequest', 'updateProviderAccount', 'toggleScheduleDate', 'sendBookingMessage', 'createSubscriptionCheckout', 'submitSubscriptionPayment']) {
    denied(() => assertProviderActionAllowed('provider', false, action, []))
  }
})

test('unapproved provider can submit the application', () => {
  for (const action of ['submitProviderApplication', 'getProviderDocumentUrl', 'setNotificationReads']) {
    assert.doesNotThrow(() => assertProviderActionAllowed('provider', false, action, []))
  }
  assert.doesNotThrow(() => assertProviderActionAllowed('provider', false, 'createUploadUrl', ['provider-document', {}]))
  denied(() => assertProviderActionAllowed('provider', false, 'createUploadUrl', ['service-image', {}]))
  denied(() => assertProviderActionAllowed('provider', false, 'createUploadUrl', ['profile-image', {}]))
})

test('approved providers, other roles and reads are unaffected', () => {
  assert.doesNotThrow(() => assertProviderActionAllowed('provider', true, 'saveProviderService', []))
  assert.doesNotThrow(() => assertProviderActionAllowed('provider', true, 'createUploadUrl', ['service-image', {}]))
  assert.doesNotThrow(() => assertProviderActionAllowed('client', false, 'updateClientAccount', []))
  assert.doesNotThrow(() => assertProviderActionAllowed('admin', false, 'reviewProviderApplication', []))
  assert.doesNotThrow(() => assertProviderActionAllowed('provider', false, undefined, []))
})

test('execute runs the gate after identity resolves and before dispatch', () => {
  const source = readFileSync('lib/server/data-service.ts', 'utf8')
  const gate = source.indexOf('assertProviderActionAllowed(identity.role, auth.isProviderApproved(identity.email), action, args)')
  assert.ok(gate > source.indexOf('export async function execute'))
  assert.ok(gate < source.indexOf('await actions[action](...args)'))
})

test('only the application tab and log out stay unlocked', () => {
  for (const [, href] of hubNav.provider) {
    const open = href === '/provider/application' || href === '/logout'
    assert.equal(isProviderPathLocked(href, false), !open, href)
    assert.equal(isProviderPathLocked(href, true), false, href)
  }
  assert.equal(isProviderPathLocked('/provider/bookings/123', false), true)
})
