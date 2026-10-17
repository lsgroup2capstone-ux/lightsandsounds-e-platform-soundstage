const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('../helpers/ts-loader.cjs')

const load = createLoader()
const { findSection, hubNav, payrollSections } = load(path.resolve('lib/data/hub-data.ts'))

test('payroll paths resolve to payroll sections, never provider', () => {
  for (const [, href] of hubNav.payroll_master) {
    if (href === '/logout') continue
    assert.equal(findSection(href).kind, 'payroll_master', href)
    assert.ok(payrollSections[href], href)
  }
})

test('unknown paths fall back to the hub of their prefix', () => {
  assert.equal(findSection('/payroll-master/nope'), payrollSections['/payroll-master'])
  assert.equal(findSection('/admin/nope').kind, 'admin')
  assert.equal(findSection('/admin/nope').dataKey, 'overview')
  assert.equal(findSection('/provider/nope').kind, 'provider')
  assert.equal(findSection('/payroll-masterx').kind, 'provider')
})
