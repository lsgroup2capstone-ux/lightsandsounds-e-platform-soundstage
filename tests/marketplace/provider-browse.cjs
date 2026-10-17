const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const createLoader = require('../helpers/ts-loader.cjs')

const load = createLoader()
const { filterProviders, groupProviders, providerSlug, serviceCategory, sortProviders, toServicePackage } = load(path.resolve('lib/marketplace/provider-services.ts'))

const service = (over) => ({ id: 's1', name: 'Wedding Sound', location: 'Balayan', coverageAreas: 'Balayan', transportationFee: 0, description: 'Bio', price: 20000, image: '', providerName: 'Rig Co', active: true, bookings: 0, ...over })

test('missing category reads as Full Production', () => {
  assert.equal(serviceCategory(service()), 'Full Production')
  assert.equal(serviceCategory(service({ category: 'Lighting' })), 'Lighting')
  assert.equal(toServicePackage(service()).category, 'Full Production')
})

test('groups active services by provider with lowest price', () => {
  const providers = groupProviders([
    service({ id: 'a', price: 30000 }),
    service({ id: 'b', price: 12000 }),
    service({ id: 'c', price: 1000, active: false }),
    service({ id: 'd', providerName: 'Other & Sons', price: 50000 }),
  ])
  assert.equal(providers.length, 2)
  assert.deepEqual(providers[0].services.map((s) => s.id), ['a', 'b'])
  assert.equal(providers[0].minPrice, 12000)
  assert.equal(providers[1].id, providerSlug('Other & Sons'))
  assert.equal(providers[1].id, 'Other%20%26%20Sons')
})

test('provider with only inactive services is not listed', () => {
  assert.deepEqual(groupProviders([service({ active: false })]), [])
})

test('server whitelists service category', () => {
  const source = readFileSync(path.resolve('lib/server/data-service.ts'), 'utf8')
  assert.match(source, /const serviceCategories = \["Sound System", "Lighting", "Full Production", "Band & Stage"\]/)
  assert.match(source, /category: serviceCategories\.includes\(String\(v\.category\)\) \? .* : "Full Production"/)
})

test('approved providers without services are listed after service providers', () => {
  const providers = groupProviders([service()], [
    { firstName: 'Ana', lastName: 'Cruz', business: '', bio: 'New here', profileImage: 'img' },
    { firstName: 'X', lastName: 'Y', business: 'Rig Co' },
  ])
  assert.equal(providers.length, 2)
  assert.equal(providers[0].name, 'Rig Co')
  assert.equal(providers[0].services.length, 1)
  assert.equal(providers[1].name, 'Ana Cruz')
  assert.deepEqual(providers[1].services, [])
  assert.equal(providers[1].bio, 'New here')
})

test('category and price must match the same service', () => {
  const providers = groupProviders([
    service({ id: 'sound', category: 'Sound System', price: 10000 }),
    service({ id: 'light', category: 'Lighting', price: 40000 }),
  ])

  assert.equal(filterProviders(providers, '', 'Lighting', 'Under PHP 15,000').length, 0)
  assert.equal(filterProviders(providers, '', 'Sound System', 'Under PHP 15,000').length, 1)
})

test('price filters use the approved inclusive boundaries', () => {
  const providers = groupProviders([
    service({ id: 'under', providerName: 'Under', price: 14999 }),
    service({ id: 'lower', providerName: 'Lower boundary', price: 15000 }),
    service({ id: 'upper', providerName: 'Upper boundary', price: 30000 }),
    service({ id: 'over', providerName: 'Over', price: 30001 }),
  ])

  assert.deepEqual(filterProviders(providers, '', 'All', 'Under PHP 15,000').map((p) => p.name), ['Under'])
  assert.deepEqual(filterProviders(providers, '', 'All', 'PHP 15,000-30,000').map((p) => p.name), ['Lower boundary', 'Upper boundary'])
  assert.deepEqual(filterProviders(providers, '', 'All', 'Over PHP 30,000').map((p) => p.name), ['Over'])
})

test('search matches provider name, location, and service name case-insensitively', () => {
  const providers = groupProviders([
    service({ id: 'one', providerName: 'Bright Crew', location: 'Lemery', name: 'Stage Wash' }),
  ])

  assert.equal(filterProviders(providers, 'BRIGHT', 'All', 'Any price').length, 1)
  assert.equal(filterProviders(providers, 'lemery', 'All', 'Any price').length, 1)
  assert.equal(filterProviders(providers, 'stage wash', 'All', 'Any price').length, 1)
  assert.equal(filterProviders(providers, 'missing', 'All', 'Any price').length, 0)
})

test('service-less providers are included by default and excluded by service filters', () => {
  const providers = groupProviders([], [
    { firstName: 'Ana', lastName: 'Cruz', business: '', bio: '', profileImage: '' },
  ])

  assert.equal(filterProviders(providers, '', 'All', 'Any price').length, 1)
  assert.equal(filterProviders(providers, '', 'Lighting', 'Any price').length, 0)
  assert.equal(filterProviders(providers, '', 'All', 'Under PHP 15,000').length, 0)
})

test('approved sorts preserve recommended order and keep service-less providers last', () => {
  const providers = groupProviders([
    service({ id: 'mid', providerName: 'Mid', price: 20000 }),
    service({ id: 'low', providerName: 'Low', price: 10000 }),
    service({ id: 'high', providerName: 'High', price: 40000 }),
  ], [
    { firstName: 'No', lastName: 'Services', business: '', bio: '', profileImage: '' },
  ])

  assert.deepEqual(sortProviders(providers, 'recommended').map((p) => p.name), ['Mid', 'Low', 'High', 'No Services'])
  assert.deepEqual(sortProviders(providers, 'price-asc').map((p) => p.name), ['Low', 'Mid', 'High', 'No Services'])
  assert.deepEqual(sortProviders(providers, 'price-desc').map((p) => p.name), ['High', 'Mid', 'Low', 'No Services'])
})
