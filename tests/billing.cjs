const { readFileSync } = require('node:fs')
const { transpileModule, ModuleKind } = require('typescript')
const assert = require('node:assert/strict')
const Module = require('node:module')
const values = new Map()
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
global.window = { dispatchEvent() {} }
let actor = { role: 'provider', email: 'provider@example.com', firstName: 'Test', lastName: 'Provider' }
const file = new Module('billing-test')
file.require = name => name === "../runtime" ? { storage: global.localStorage, session: global.sessionStorage, events: global.window } : name === './client-auth' ? { getAccount: () => actor } : require(name)
file._compile(transpileModule(readFileSync('lib/server/domain/marketplace-billing.ts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, 'billing-test.js')
const billing = file.exports
const trial = billing.ensureProviderTrial(actor.email)
assert.equal(Date.parse(trial.trialEnd) - Date.parse(trial.trialStart), 7 * 86400000)
assert.deepEqual(billing.ensureProviderTrial(actor.email), trial)
assert.equal(billing.subscriptionStatus(trial, Date.parse(trial.trialEnd)), 'Expired')
assert.throws(() => billing.submitSubscriptionPayment('Starter', 'GCash', 'x'))
billing.submitSubscriptionPayment('Starter', 'GCash', 'TRANSFER-001')
assert.throws(() => billing.submitSubscriptionPayment('Starter', 'GCash', 'TRANSFER-002'))
const payment = billing.getSubscriptionPayments()[0]
assert.equal(payment.status, 'Pending')
assert.equal(payment.invoice, undefined)
assert.throws(() => billing.reviewSubscriptionPayment(payment.id, 'Paid'))
actor = { role: 'admin', email: 'admin@example.com', firstName: 'Test', lastName: 'Admin' }
billing.reviewSubscriptionPayment(payment.id, 'Paid')
assert.equal(billing.getSubscriptionPayments()[0].status, 'Paid')
assert.ok(billing.getSubscriptionPayments()[0].invoice)
assert.equal(billing.getAuditEntries().filter(log => log.action === "Subscription payment reviewed").length, 1)
assert.equal(billing.getAuditEntries()[0].before, 'Pending')
assert.throws(() => billing.reviewSubscriptionPayment(payment.id, 'Paid'))
assert.equal(billing.getAuditEntries().filter(log => log.action === "Subscription payment reviewed").length, 1)
const active = billing.getProviderSubscription('provider@example.com')
assert.equal(Date.parse(active.paidUntil) - Date.parse(trial.trialEnd), 30 * 86400000)
billing.migrateProviderBilling('provider@example.com', 'new@example.com')
assert.equal(billing.getProviderSubscription('new@example.com').trialEnd, trial.trialEnd)
actor = { role: 'provider', email: 'unrelated@example.com' }
assert.equal(billing.getSubscriptionPayments().length, 0)
assert.equal(billing.getAuditEntries().length, 0)
console.log('Billing checks passed: trial duration/expiry, duplicate prevention, role checks, confirmation, receipt, audit, renewal, migration and account isolation.')

actor = { role: 'client', email: 'client@example.com' }
assert.throws(() => billing.payDemoSubscription('Starter', 'GCash'))
actor = { role: 'provider', email: 'demo@example.com', firstName: 'Demo', lastName: 'Provider' }
assert.throws(() => billing.payDemoSubscription('Starter', 'Invalid'))
const demo = billing.payDemoSubscription('Pro', 'Maya')
assert.equal(demo.status, 'Paid')
assert.equal(demo.amount, 999)
assert.ok(demo.invoice)
assert.ok(demo.reference.startsWith('DEMO-'))
assert.equal(billing.subscriptionStatus(billing.getProviderSubscription(actor.email)), 'Active')
actor = { role: 'admin', email: 'admin@example.com' }
assert.ok(billing.getAuditEntries().some(log => log.target === demo.id))
console.log('Demo subscription checks passed: role, method, amount, activation, invoice and audit trail.')
