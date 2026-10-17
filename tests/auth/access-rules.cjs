const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('../helpers/ts-loader.cjs')

const rules = createLoader()(path.resolve('lib/server/auth/access-rules.ts'))

test('dashboardFor maps every supported role', () => {
  assert.equal(rules.dashboardFor('client'), '/client')
  assert.equal(rules.dashboardFor('provider'), '/provider')
  assert.equal(rules.dashboardFor('payroll_master'), '/payroll-master')
  assert.equal(rules.dashboardFor('admin'), '/admin')
})

test('areaFor matches protected path segments without prefix confusion', () => {
  assert.equal(rules.areaFor('/client'), 'client')
  assert.equal(rules.areaFor('/client/bookings?tab=open'), 'client')
  assert.equal(rules.areaFor('/provider/services'), 'provider')
  assert.equal(rules.areaFor('/payroll-master'), 'payroll_master')
  assert.equal(rules.areaFor('/admin/accounts'), 'admin')
  assert.equal(rules.areaFor('/dashboard'), 'router')
  assert.equal(rules.areaFor('/dashboard/history'), 'router')
  assert.equal(rules.areaFor('/clientele'), null)
  assert.equal(rules.areaFor('/administrator'), null)
  assert.equal(rules.areaFor('/browse'), null)
})

test('canAccessPath permits public and owned paths but rejects other areas and the router', () => {
  assert.equal(rules.canAccessPath('client', '/browse'), true)
  assert.equal(rules.canAccessPath('client', '/client?tab=payments'), true)
  assert.equal(rules.canAccessPath('client', '/provider'), false)
  assert.equal(rules.canAccessPath('client', '/payroll-master'), false)
  assert.equal(rules.canAccessPath('client', '/admin'), false)
  assert.equal(rules.canAccessPath('client', '/dashboard'), false)
})

test('safeReturnTo accepts only safe same-origin relative paths', () => {
  assert.equal(rules.safeReturnTo('/client?tab=payments'), '/client?tab=payments')
  assert.equal(rules.safeReturnTo('/browse#packages'), '/browse#packages')
  for (const value of ['//evil.example', '/\\evil.example', '/%5cevil.example', 'https://evil.example', 'javascript:alert(1)', '/client\nadmin', '/%0d%0aevil', '%2Fclient', null, 7]) {
    assert.equal(rules.safeReturnTo(value), null, String(value))
  }
})

test('resolveAccess follows fail-closed decision ordering', () => {
  const activeClient = { role: 'client', status: 'active' }
  assert.deepEqual(rules.resolveAccess({ area: 'client', profile: activeClient, profileError: true }), { kind: 'error' })
  assert.deepEqual(rules.resolveAccess({ area: 'client', profile: null }), { kind: 'complete' })
  assert.deepEqual(rules.resolveAccess({ area: 'client', profile: { role: 'client', status: 'suspended' } }), { kind: 'signout', status: 'suspended' })
  assert.deepEqual(rules.resolveAccess({ area: 'admin', profile: activeClient }), { kind: 'redirect', to: '/client' })
  assert.deepEqual(rules.resolveAccess({ area: 'client', profile: activeClient, claimRole: 'provider' }), { kind: 'refresh', to: '/client' })
  assert.deepEqual(rules.resolveAccess({ area: 'client', profile: activeClient, claimRole: 'client' }), { kind: 'allow' })
  assert.deepEqual(rules.resolveAccess({ area: 'client', profile: activeClient, claimRole: null }), { kind: 'allow' })
})
