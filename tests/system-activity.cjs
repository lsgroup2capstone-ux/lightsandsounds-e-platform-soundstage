const { readFileSync } = require('node:fs')
const { transpileModule, ModuleKind } = require('typescript')
const assert = require('node:assert/strict')
const Module = require('node:module')
let role = 'admin'
const modules = {
 './client-auth': { getAccount: () => ({ role }), getAccountsForAdmin: () => [{ role: 'provider', email: 'p@example.com', firstName: 'P', lastName: 'Test', application: { status: 'Pending', submittedAt: '2026-01-01', documents: [] } }] },
 './client-bookings': { getAllBookings: () => [{ id: 'BK-1', client: 'Client', provider: 'Provider', packageName: 'Event', status: 'Completed', paid: true, downpayment: 300, total: 1000, date: '2026-01-01', paidAt: '2026-01-01', feedback: { rating: 5, comment: 'Great', createdAt: '2026-01-02' }, refund: { status: 'Pending', amount: 300, requestedAt: '2026-01-03' } }] },
 './marketplace-billing': { getSubscriptionPayments: () => [], getAuditEntries: () => [{ id: 'A1', target: 'BK-1', action: 'Refund requested', actor: 'Client', at: '2026-01-04', before: 'Eligible', after: 'Pending' }, { id: 'A2', target: 'missing', action: 'Service removed', actor: 'Provider', at: '2026-01-05', before: 'Old service', after: 'Removed' }] },
 './provider-services': { getProviderServices: () => [] },
 './communications': { getBookingMessages: () => [{ id: 'MSG-1', senderName: 'Client', createdAt: '2026-01-02', bookingId: 'BK-1', body: 'Hello' }], getProviderReports: () => [{ id: 'RPT-1', client: 'Client', createdAt: '2026-01-02', status: 'Pending', reason: 'Late', bookingId: 'BK-1' }] },
 './withdrawals': { getWithdrawalRequests: () => [{ id: 'WD-1', provider: 'Provider', requestedAt: '2026-01-02', status: 'Pending', amount: 100 }] }
}
const file = new Module('activity-test')
file.require = name => modules[name] || require(name)
file._compile(transpileModule(readFileSync('lib/system-activity.ts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, 'activity-test.js')
const rows = file.exports.getSystemActivity()
assert.equal(rows[0].id, 'audit-A2')
assert.equal(rows.find(r => r.id === 'audit-A1').href, '/admin/refunds#transaction-RF-BK-1')
assert.equal(rows.find(r => r.id === 'report-RPT-1').href, '/admin/reports#activity-report-RPT-1')
assert.equal(rows.find(r => r.id === 'payment-BK-1').href, '/admin/payments#transaction-BK-1')
assert.equal(rows.find(r => r.id === 'withdrawal-WD-1').href, '/admin/payments#transaction-WD-1')
for (const row of rows.filter(r => r.href.startsWith('/admin/activity'))) assert.ok(rows.some(target => row.href.endsWith(encodeURIComponent('activity-' + target.id))))
assert.ok(rows.some(r => r.category === 'Feedback'))
assert.ok(rows.some(r => r.category === 'Messages'))
assert.equal(new Set(rows.map(r => r.id)).size, rows.length)
role = 'client'
assert.deepEqual(file.exports.getSystemActivity(), [])
console.log('System activity checks passed: category coverage, chronological sorting, record links, deleted-record fallback, unique IDs and admin access.')
