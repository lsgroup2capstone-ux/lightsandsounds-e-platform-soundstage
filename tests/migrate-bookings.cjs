const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist')
const { migrateBookings, exportBookings } = require('../scripts/db/migrate-bookings.cjs')

const tag = connection => {
  const query = async (parts, ...values) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), values)).rows
  query.json = value => JSON.stringify(value)
  return query
}
const later = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
const base = { packageId: 'svc-1', packageName: 'Pro Sound', provider: 'Events', client: 'Client', image: '', time: '18:00', location: 'Hall', guests: 50, notes: '', durationDays: 1, basePrice: 10000, transportationFee: 0, eventTown: 'Manila', total: 10000, downpayment: 3000 }
const legacy = {
  'soundstage-accounts-v2': [{ role: 'provider', email: 'provider@test.com', application: { status: 'Approved' } }],
  'soundstage-provider-services-v2:provider%40test.com': [{ id: 'svc-1', name: 'Pro Sound', price: 10000, location: 'Manila', coverageAreas: 'Manila', active: true }],
  'soundstage-client-bookings-v3:client%40test.com': [
    { ...base, id: 'BK-PEND', date: later(30), status: 'Pending', paid: true },
    { ...base, id: 'BK-CONF', date: later(40), durationDays: 2, status: 'Confirmed', paid: true },
    { ...base, id: 'BK-DONE', date: '2026-01-10', status: 'Completed', paid: true, feedback: { rating: 5, comment: 'Great', createdAt: '2026-01-11T00:00:00.000Z' } },
    { ...base, id: 'BK-CANC', date: later(50), status: 'Cancelled', paid: false, cancelledBy: 'client' },
    { ...base, id: 'BK-RFND', date: later(60), status: 'Cancelled', paid: true, cancelledBy: 'provider', refund: { status: 'Pending', amount: 3000, method: 'GCash', account: '09123456789', requestedAt: '2026-02-01' } },
    { ...base, id: 'BK-RFDP', date: later(61), status: 'Cancelled', paid: true, cancelledBy: 'provider', refund: { status: 'Paid', amount: 3000, method: 'Maya', account: '09987654321', requestedAt: '2026-02-01', reference: 'TRX-9' } },
    { ...base, id: 'BK-ODD', date: later(70), status: 'Archived', paid: false },
    { ...base, id: 'BK-NOPROV', packageId: 'gone', date: later(71), status: 'Pending', paid: false },
    { ...base, id: 'BK-UNPAID', date: later(72), status: 'Confirmed', paid: false },
    { ...base, id: 'BK-NODATE', date: 'soon', status: 'Pending', paid: false },
  ],
  'soundstage-client-bookings-v3:other%40test.com': [
    { ...base, id: 'BK-CLASH', date: later(41), status: 'Confirmed', paid: true },
  ],
  'soundstage-paymongo:BK-PEND': { id: 'BK-PEND', email: 'client@test.com', amount: 3000, sessionId: 'cs_old_1', checkoutUrl: 'https://checkout.paymongo.com/1', kind: 'booking', paid: true },
  'soundstage-paymongo:BK-CANC': { id: 'BK-CANC', email: 'client@test.com', amount: 3000, sessionId: 'cs_old_2', checkoutUrl: 'https://checkout.paymongo.com/2', kind: 'booking', cancelled: true },
  'soundstage-paymongo:sub-1': { id: 'sub-1', email: 'provider@test.com', amount: 499, sessionId: 'cs_old_3', checkoutUrl: 'https://checkout.paymongo.com/3', kind: 'subscription', plan: 'Starter' },
  'soundstage-paymongo:BK-ODD': { id: 'BK-ODD', email: 'client@test.com', amount: 3000, sessionId: 'cs_old_4', checkoutUrl: 'https://checkout.paymongo.com/4', kind: 'booking', paid: true },
  'soundstage-schedule:provider%40test.com': [later(80), later(81), 'not-a-date'],
}

async function setup() {
  const db = new PGlite({ extensions: { btree_gist } })
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('database/schema.sql', 'utf8'))
  for (const [key, value] of Object.entries(legacy)) await db.query('INSERT INTO soundstage.records(key, value) VALUES ($1, $2)', [key, JSON.stringify(value)])
  const sql = Object.assign(tag(db), { begin: callback => db.transaction(tx => callback(tag(tx))) })
  const one = async (q, args) => (await db.query(q, args)).rows
  const records = async () => (await one('SELECT key, value::text AS value FROM soundstage.records ORDER BY key')).map(r => r.key + '=' + r.value).join('\n')
  return { db, sql, one, records }
}
const counts = r => ({ migrated: r.migrated.length, skipped: r.skipped.length, ...(r.conflicts ? { conflicts: r.conflicts.length } : {}), unmappable: r.unmappable.length })

test('dry run reports counts and writes nothing; execute migrates once and leaves JSON identical (AC4, T5.1)', async () => {
  const h = await setup()
  try {
    const before = await h.records()
    const dry = await migrateBookings(h.sql)
    assert.equal(dry.execute, false)
    assert.deepEqual(counts(dry.bookings), { migrated: 6, skipped: 0, conflicts: 1, unmappable: 4 })
    assert.equal((await h.one('SELECT count(*)::int AS n FROM soundstage.bookings'))[0].n, 0)
    const run = await migrateBookings(h.sql, { execute: true })
    assert.deepEqual(counts(run.bookings), counts(dry.bookings))
    assert.deepEqual(run.blockedDates, { migrated: 2, skipped: 0, invalid: 1 })
    const rows = await h.one('SELECT legacy_id, status FROM soundstage.bookings ORDER BY legacy_id')
    assert.deepEqual(Object.fromEntries(rows.map(r => [r.legacy_id, r.status])), { 'BK-CANC': 'cancelled', 'BK-CONF': 'confirmed', 'BK-DONE': 'completed', 'BK-PEND': 'pending', 'BK-RFDP': 'refunded', 'BK-RFND': 'refund_pending' })
    const history = await h.one("SELECT b.legacy_id, h.old_status, h.new_status, h.actor_role, h.reason FROM soundstage.booking_status_history h JOIN soundstage.bookings b ON b.id = h.booking_id WHERE b.legacy_id IN ('BK-CONF', 'BK-RFND') ORDER BY h.id")
    assert.deepEqual(history.map(r => [r.legacy_id, r.old_status, r.new_status, r.actor_role]), [['BK-CONF', null, 'confirmed', 'system'], ['BK-RFND', null, 'cancelled', 'system'], ['BK-RFND', 'cancelled', 'refund_pending', 'system']])
    assert.equal(history[0].reason, 'migrated from JSON')
    assert.deepEqual(JSON.parse(history[2].reason), { method: 'GCash', account: '09123456789' })
    const [snap] = await h.one("SELECT package_name, package_price::float AS price, total::float AS total, start_date::text AS s, end_date::text AS e, feedback FROM soundstage.bookings WHERE legacy_id = 'BK-CONF'")
    assert.deepEqual(snap, { package_name: 'Pro Sound', price: 10000, total: 10000, s: later(40), e: later(42), feedback: null })
    const rerun = await migrateBookings(h.sql, { execute: true })
    assert.deepEqual(counts(rerun.bookings), { migrated: 0, skipped: 6, conflicts: 1, unmappable: 4 })
    assert.deepEqual(rerun.blockedDates, { migrated: 0, skipped: 2, invalid: 1 })
    assert.equal(await h.records(), before)
  } finally { await h.db.close() }
})

test('unmappable bookings are listed with a reason and not inserted (AC5, T5.2)', async () => {
  const h = await setup()
  try {
    const run = await migrateBookings(h.sql, { execute: true })
    assert.deepEqual(Object.fromEntries(run.bookings.unmappable.map(u => [u.legacy_id, u.reason])), {
      'BK-ODD': 'unknown status Archived', 'BK-NOPROV': 'missing provider', 'BK-UNPAID': 'confirmed but unpaid', 'BK-NODATE': 'missing or invalid dates',
    })
    assert.equal((await h.one("SELECT count(*)::int AS n FROM soundstage.bookings WHERE legacy_id IN ('BK-ODD', 'BK-NOPROV', 'BK-UNPAID', 'BK-NODATE')"))[0].n, 0)
  } finally { await h.db.close() }
})

test('overlapping confirmed bookings: one migrates, the other is reported with both ids (AC6, T5.3)', async () => {
  const h = await setup()
  try {
    const run = await migrateBookings(h.sql, { execute: true })
    assert.deepEqual(run.bookings.conflicts, [{ legacy_id: 'BK-CLASH', conflictsWith: 'BK-CONF' }])
    assert.equal((await h.one("SELECT count(*)::int AS n FROM soundstage.bookings WHERE legacy_id = 'BK-CLASH'"))[0].n, 0)
  } finally { await h.db.close() }
})

test('PayMongo records migrate with mapped status; a paid Pending booking confirms on accept (payments AC20, T5.4)', async () => {
  const h = await setup()
  try {
    const run = await migrateBookings(h.sql, { execute: true })
    assert.deepEqual(counts(run.payments), { migrated: 3, skipped: 0, unmappable: 1 })
    assert.deepEqual(run.payments.unmappable, [{ legacy_id: 'BK-ODD', reason: 'booking not migrated' }])
    const rows = await h.one('SELECT legacy_id, target_kind, target_id, type, status, amount::float AS amount FROM soundstage.payments ORDER BY legacy_id')
    const [pend] = await h.one("SELECT id FROM soundstage.bookings WHERE legacy_id = 'BK-PEND'")
    const [canc] = await h.one("SELECT id FROM soundstage.bookings WHERE legacy_id = 'BK-CANC'")
    assert.deepEqual(rows, [
      { legacy_id: 'BK-CANC', target_kind: 'booking', target_id: canc.id, type: 'downpayment', status: 'expired', amount: 3000 },
      { legacy_id: 'BK-PEND', target_kind: 'booking', target_id: pend.id, type: 'downpayment', status: 'paid', amount: 3000 },
      { legacy_id: 'sub-1', target_kind: 'subscription', target_id: 'provider@test.com', type: 'subscription', status: 'expired', amount: 499 },
    ])
    assert.deepEqual(counts((await migrateBookings(h.sql, { execute: true })).payments), { migrated: 0, skipped: 3, unmappable: 1 })
    // Accepting the legacy paid Pending booking goes straight to confirmed (design U2).
    const load = require('./helpers/ts-loader.cjs')()
    const runtime = load('lib/server/runtime.ts')
    const core = load('lib/server/bookings/core.ts')
    load('lib/server/payments/ledger.ts')
    const { MemoryStorage } = load('lib/data/memory-storage.ts')
    const values = Object.fromEntries(Object.entries(legacy).map(([k, v]) => [k, JSON.stringify(v)]))
    const result = await h.db.transaction(tx => runtime.context.run({ storage: new MemoryStorage(values), session: new MemoryStorage(), tx: tag(tx) }, () => core.transition(pend.id, 'accepted', { id: 'p', email: 'provider@test.com', role: 'provider' })))
    assert.equal(result.status, 'confirmed')
  } finally { await h.db.close() }
})

test('a rejected refund keeps its history so it still counts as the one request (review-5 M1)', async () => {
  const h = await setup()
  try {
    const rejected = { ...base, id: 'BK-RFRJ', date: later(90), status: 'Cancelled', paid: true, cancelledBy: 'provider', refund: { status: 'Rejected', amount: 3000, method: 'GCash', account: '09111111111', requestedAt: '2026-02-01', reason: 'Outside policy' } }
    const odd = { ...base, id: 'BK-WHO', date: later(91), status: 'Cancelled', paid: false, cancelledBy: 'someone' }
    await h.db.query('INSERT INTO soundstage.records(key, value) VALUES ($1, $2)', ['soundstage-client-bookings-v3:late%40test.com', JSON.stringify([rejected, odd])])
    const run = await migrateBookings(h.sql, { execute: true })
    assert.ok(run.bookings.migrated.includes('BK-RFRJ'))
    const [row] = await h.one("SELECT id, status FROM soundstage.bookings WHERE legacy_id = 'BK-RFRJ'")
    assert.equal(row.status, 'cancelled')
    const steps = await h.one('SELECT old_status, new_status, reason FROM soundstage.booking_status_history WHERE booking_id = $1 ORDER BY id', [row.id])
    assert.deepEqual(steps.map(s => [s.old_status, s.new_status]), [[null, 'cancelled'], ['cancelled', 'refund_pending'], ['refund_pending', 'cancelled']])
    assert.deepEqual(JSON.parse(steps[1].reason), { method: 'GCash', account: '09111111111' })
    assert.equal(steps[2].reason, 'Outside policy')
    const exported = (await exportBookings(h.sql))['soundstage-client-bookings-v3:late%40test.com'][0]
    assert.equal(exported.status, 'Cancelled')
    assert.equal(exported.refund.status, 'Rejected')
    assert.match(exported.refund.requestedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(exported.provider, 'provider@test.com')
    // An unknown canceller is reported, not guessed (review-5 m2).
    assert.deepEqual(run.bookings.unmappable.find(u => u.legacy_id === 'BK-WHO'), { legacy_id: 'BK-WHO', reason: 'invalid cancelledBy someone' })
  } finally { await h.db.close() }
})

test('export round-trips migrated rows to the legacy Booking shape (T5.5)', async () => {
  const h = await setup()
  try {
    await migrateBookings(h.sql, { execute: true })
    const before = await h.one('SELECT count(*)::int AS n FROM soundstage.bookings')
    const out = await exportBookings(h.sql)
    assert.deepEqual(Object.keys(out), ['soundstage-client-bookings-v3:client%40test.com'])
    const byId = Object.fromEntries(out['soundstage-client-bookings-v3:client%40test.com'].map(b => [b.id, b]))
    const original = Object.fromEntries(legacy['soundstage-client-bookings-v3:client%40test.com'].map(b => [b.id, b]))
    for (const id of ['BK-CONF', 'BK-DONE', 'BK-CANC', 'BK-RFND', 'BK-RFDP', 'BK-PEND']) {
      for (const field of ['packageId', 'packageName', 'date', 'durationDays', 'time', 'location', 'guests', 'total', 'downpayment', 'status', 'basePrice', 'eventTown']) assert.deepEqual(byId[id][field], original[id][field], `${id}.${field}`)
    }
    assert.deepEqual(byId['BK-DONE'].feedback, original['BK-DONE'].feedback)
    assert.equal(byId['BK-CONF'].paid, false) // no PayMongo record for it: the legacy flag is not trusted without money
    assert.equal(byId['BK-PEND'].paid, true)
    assert.equal(byId['BK-RFND'].cancelledBy, 'provider')
    assert.deepEqual([byId['BK-RFND'].refund.status, byId['BK-RFND'].refund.method, byId['BK-RFND'].refund.account], ['Pending', 'GCash', '09123456789'])
    assert.deepEqual([byId['BK-RFDP'].refund.status, byId['BK-RFDP'].refund.reference], ['Paid', 'TRX-9'])
    assert.deepEqual(await h.one('SELECT count(*)::int AS n FROM soundstage.bookings'), before)
  } finally { await h.db.close() }
})
