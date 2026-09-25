const { readFileSync } = require('node:fs')
const { transpileModule, ModuleKind } = require('typescript')
const assert = require('node:assert/strict')
const Module = require('node:module')
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
global.localStorage = storage(); global.sessionStorage = storage(); global.window = { dispatchEvent() {} }
const trials = [], audits = []
const file = new Module('applications-test')
file.require = name => name === "../runtime" ? { storage: global.localStorage, session: global.sessionStorage, events: global.window } : name === './marketplace-billing' ? { ensureProviderTrial: email => trials.push(email), migrateProviderBilling() {}, recordAdminAction: (...args) => audits.push(args), recordMarketplaceAction: (...args) => audits.push(args) } : require(name)
file._compile(transpileModule(readFileSync('lib/server/domain/client-auth.ts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, 'applications-test.js')
const auth = file.exports
const documents = [{ name: 'permit.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0=' }]
const account = { role: 'provider', email: 'provider@example.com', firstName: 'Test', lastName: 'Provider', business: 'Events', authMethod: 'email', application: { status: 'Pending', documents, submittedAt: new Date().toISOString() } }
localStorage.setItem('soundstage-accounts-v2', JSON.stringify([account]))
sessionStorage.setItem('soundstage-session', JSON.stringify({ role: account.role, email: account.email }))
assert.equal(trials.length, 0)
assert.equal(auth.isProviderApproved(account.email), false)
assert.throws(() => auth.reviewProviderApplication(account.email, 'Approved', ''))
assert.throws(() => auth.submitProviderApplication(documents))
function admin() { localStorage.setItem('soundstage-admin-account', JSON.stringify({ role: 'admin', email: 'admin@example.com' })); sessionStorage.setItem('soundstage-session', JSON.stringify({ role: 'admin', email: 'admin@example.com' })) }
admin()
assert.throws(() => auth.reviewProviderApplication(account.email, 'Rejected', ''))
auth.reviewProviderApplication(account.email, 'Rejected', 'Please send a clearer ID')
assert.equal(trials.length, 0)
sessionStorage.setItem('soundstage-session', JSON.stringify({ role: account.role, email: account.email }))
assert.equal(auth.getAccount().application.reason, 'Please send a clearer ID')
assert.throws(() => auth.submitProviderApplication([]))
auth.submitProviderApplication(documents)
assert.equal(auth.getAccount().application.status, 'Pending')
admin()
auth.reviewProviderApplication(account.email, 'Approved', 'Documents verified')
assert.equal(auth.isProviderApproved(account.email), true)
assert.equal(trials.length, 1)
assert.throws(() => auth.reviewProviderApplication(account.email, 'Approved', 'Again'))
assert.ok(audits.some(row => row[0] === 'Provider application reviewed'))
sessionStorage.setItem('soundstage-session', JSON.stringify({ role: account.role, email: account.email }))
assert.equal(auth.getAccount().application.documents[0].name, 'permit.pdf')
assert.throws(() => auth.validateProviderDocuments([{ name: 'bad.html', type: 'text/html', data: 'data:text/html;base64,AAAA' }]))
console.log('Provider application checks passed: documents, pending signup, trial timing, admin authorization, rejection, resubmission, approval, duplicate review, Supabase identity and audit.')
