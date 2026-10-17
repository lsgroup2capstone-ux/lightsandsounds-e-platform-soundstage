const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { readFileSync, readdirSync, statSync } = require('node:fs')
const paymongoFixture = require('../helpers/paymongo-fixture.cjs')()
const tx = Object.assign(async () => [], { json: value => value })
let failTransaction = false
const database = { getDatabase: () => ({ begin: async fn => { const result = await fn(tx); if (failTransaction) throw new Error('rollback'); return result } }) }
const load = require('../helpers/ts-loader.cjs')({ [path.resolve('lib/server/payments/paymongo.ts')]: paymongoFixture, [path.resolve('lib/server/db/database.ts')]: database })
const { context, queueDelete } = load('lib/server/runtime.ts')
const { MemoryStorage } = load('lib/data/memory-storage.ts')
const keys = load('lib/server/storage/file-keys.ts')
const r2 = load('lib/server/storage/r2.ts')
const service = load('lib/server/data-service.ts')
const { actions } = service

const env = { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'AKID', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket', R2_PUBLIC_URL: 'https://pub.r2.dev/' }
Object.assign(process.env, env)
const id = '0123456789abcdef0123456789abcdef'
const client = { role: 'client', email: 'client@test.com', firstName: 'C', lastName: 'L', mobile: '', authMethod: 'email' }
const provider = { ...client, role: 'provider', email: 'provider@test.com', business: 'Events' }
const other = { ...provider, email: 'other@test.com', business: 'Other' }
const admin = { ...client, role: 'admin', email: 'admin@test.com' }
const docKey = keys.buildKey('provider-document', provider.email, id, 'application/pdf')
provider.application = { status: 'Pending', submittedAt: '2026-01-01', documents: [{ name: 'permit.pdf', type: 'application/pdf', key: docKey, size: 10 }] }
function fixture(actor) {
  const state = { storage: new MemoryStorage(), session: new MemoryStorage() }
  state.storage.setItem('soundstage-accounts-v2', JSON.stringify([client, provider, other]))
  state.storage.setItem('soundstage-admin-account', JSON.stringify(admin))
  state.storage.setItem('soundstage-provider-services-v2:other%40test.com', JSON.stringify([{ id: 'other-service' }]))
  if (actor) state.session.setItem('soundstage-session', JSON.stringify(actor))
  return state
}
const as = (actor, fn) => context.run(fixture(actor), fn)
const params = url => new URL(url).searchParams

test('keys: prefixes per kind, owner scoping and strict format', () => {
  assert.match(docKey, /^private\/provider-docs\/[a-f0-9]{32}\/[a-f0-9]{32}\.pdf$/)
  assert.ok(!docKey.includes('provider@'))
  assert.match(keys.buildKey('profile-image', client.email, id, 'image/webp'), /^public\/profile\//)
  assert.match(keys.buildKey('service-image', provider.email, id, 'image/png'), /^public\/service\//)
  assert.throws(() => keys.buildKey('profile-image', client.email, id, 'application/pdf'))
  assert.equal(keys.isOwnKey('provider-document', provider.email, docKey), true)
  assert.equal(keys.isOwnKey('provider-document', other.email, docKey), false)
  assert.equal(keys.isOwnKey('profile-image', provider.email, docKey), false)
  const own = keys.buildKey('profile-image', client.email, id, 'image/png')
  for (const bad of [own.replace('public/', 'public/../'), own.replace('.png', '/x.png'), own.replace('.png', 'Xpng'), own.replace('.png', '/png'), own.toUpperCase(), 'data:image/png;base64,AAAA', '', null])
    assert.equal(keys.isOwnKey('profile-image', client.email, bad), false)
  assert.equal(keys.isDataUrl(' data:image/png;base64,AA'), true)
})

test('r2: missing configuration fails clearly; presigned PUT is short-lived and signs type and size', async () => {
  for (const name of Object.keys(env)) {
    const saved = process.env[name]
    delete process.env[name]
    assert.throws(() => r2.r2Config(), error => error.status === 503 && /File storage is not configured/.test(error.message))
    process.env[name] = saved
  }
  const put = await r2.presignPut('public/profile/a/b.png', 'image/png', 123, 3600)
  const q = params(put.url)
  assert.ok(Number(q.get('X-Amz-Expires')) <= 600)
  assert.equal(q.get('X-Amz-SignedHeaders'), 'content-length;content-type;host')
  assert.deepEqual(put.headers, { 'Content-Type': 'image/png', 'Content-Length': '123' })
  assert.equal(r2.publicBaseUrl(), 'https://pub.r2.dev')
})

test('credentials stay server-only', () => {
  assert.match(readFileSync('lib/server/storage/r2.ts', 'utf8'), /^import "server-only"/)
  const files = dir => readdirSync(dir).flatMap(name => { const p = path.join(dir, name); return statSync(p).isDirectory() ? files(p) : [p] })
  for (const file of ['app', 'components', 'lib'].flatMap(files).filter(f => /\.(ts|tsx)$/.test(f)))
    assert.ok(!/NEXT_PUBLIC_R2/.test(readFileSync(file, 'utf8')), file)
})

test('createUploadUrl: role, type, size and service ownership', async () => {
  await as(client, async () => {
    const result = await actions.createUploadUrl('profile-image', { type: 'image/jpeg', size: 1000 })
    assert.equal(keys.isOwnKey('profile-image', client.email, result.key), true)
    assert.ok(Number(params(result.url).get('X-Amz-Expires')) <= 600)
    await assert.rejects(actions.createUploadUrl('provider-document', { type: 'application/pdf', size: 10 }), error => error.status === 403)
    await assert.rejects(actions.createUploadUrl('profile-image', { type: 'image/gif', size: 10 }), error => error.status === 400 && /JPG, PNG or WebP/.test(error.message))
    await assert.rejects(actions.createUploadUrl('profile-image', { type: 'image/png', size: 5 * 1024 * 1024 + 1 }), error => error.status === 400)
    await assert.rejects(actions.createUploadUrl('profile-image', { type: 'image/png', size: 0 }), error => error.status === 400)
    await assert.rejects(actions.createUploadUrl('avatar', { type: 'image/png', size: 1 }), error => error.status === 400)
  })
  await as(provider, async () => {
    const doc = await actions.createUploadUrl('provider-document', { type: 'application/pdf', size: 5 * 1024 * 1024 })
    assert.match(doc.key, /^private\/provider-docs\//)
    await assert.rejects(actions.createUploadUrl('service-image', { type: 'image/png', size: 10, serviceId: 'other-service' }), error => error.status === 403)
    const own = await actions.createUploadUrl('service-image', { type: 'image/png', size: 10, serviceId: 'new-service' })
    assert.equal(keys.isOwnKey('service-image', provider.email, own.key), true)
  })
})

test('createUploadUrl requires a signed-in user', async () => {
  await assert.rejects(service.execute(null, 'createUploadUrl', ['profile-image', { type: 'image/png', size: 1 }]), error => error.status === 401)
})

test('getProviderDocumentUrl: owner and admin only, five-minute expiry', async () => {
  for (const actor of [provider, admin]) await as(actor, async () => {
    const result = await actions.getProviderDocumentUrl(provider.email, 0)
    assert.equal(params(result.url).get('X-Amz-Expires'), '300')
    assert.ok(result.url.includes(id + '.pdf'))
  })
  for (const actor of [other, client]) await as(actor, async () => {
    await assert.rejects(actions.getProviderDocumentUrl(provider.email, 0), error => error.status === 403)
  })
})

test('getProviderDocumentUrl: download name keeps letters and strips quote, backslash, CR and LF', async () => {
  const doc = provider.application.documents[0], original = doc.name
  try {
    for (const [name, expected] of [['permit report.pdf', 'permit report.pdf'], ['a"b\\c\r\nd.pdf', 'a_b_c__d.pdf']]) {
      doc.name = name
      await as(provider, async () => {
        const result = await actions.getProviderDocumentUrl(provider.email, 0)
        assert.equal(params(result.url).get('response-content-disposition'), `inline; filename="${expected}"`)
      })
    }
  } finally { doc.name = original }
})

test('queued deletes run after commit; failures are logged and never undo the action', async () => {
  const realFetch = global.fetch, realError = console.error
  const deleted = [], logged = []
  global.fetch = async request => { deleted.push(new URL(request.url).pathname); return new Response(null, { status: 500 }) }
  console.error = (...args) => logged.push(args)
  let queued = 'public/profile/a/old.png'
  actions.__testQueue = () => { queueDelete(queued); return 'done' }
  const user = { id: 'u1', email: client.email, email_confirmed_at: 'x', app_metadata: {}, user_metadata: {} }
  try {
    const response = await service.execute(user, '__testQueue', [])
    assert.equal(response.result, 'done')
    assert.equal(response.filesBaseUrl, 'https://pub.r2.dev')
    assert.ok(deleted.some(p => p.endsWith('/old.png')))
    assert.deepEqual(logged.at(-1), ['R2 delete failed', { key: 'public/profile/a/old.png' }])
    deleted.length = 0
    failTransaction = true
    queued = 'public/profile/a/kept.png'
    await assert.rejects(service.execute(user, '__testQueue', []))
    assert.equal(deleted.length, 0)
  } finally { failTransaction = false; global.fetch = realFetch; console.error = realError; delete actions.__testQueue }
})

const newId = n => String(n).repeat(32)
const pngKey = (kind, email, n) => keys.buildKey(kind, email, newId(n), 'image/png')
const approved = { ...provider, application: { ...provider.application, status: 'Approved' } }
const bookingKey = 'soundstage-client-bookings-v3:client%40test.com'
async function run(actor, setup, fn) {
  const state = fixture(actor)
  setup?.(state.storage)
  const result = await context.run(state, fn)
  return { state, result, deletes: state.pendingDeletes || [] }
}
async function withHead(status, type, fn) {
  const realFetch = global.fetch, heads = []
  global.fetch = async request => { if (request.method !== 'HEAD') throw new Error('unexpected ' + request.method); heads.push(new URL(request.url).pathname); return new Response(null, { status, headers: { 'content-length': '10', 'content-type': type } }) }
  try { return await fn(heads) } finally { global.fetch = realFetch }
}
const accounts = (storage, ...list) => storage.setItem('soundstage-accounts-v2', JSON.stringify(list))
const rejected = (status = 400, pattern = /Upload the file again/) => error => error.status === status && pattern.test(error.message)

test('profile saves accept only own verified keys and delete the replaced image', async () => {
  const oldKey = pngKey('profile-image', client.email, 1), newKey = pngKey('profile-image', client.email, 2)
  const withImage = storage => accounts(storage, { ...client, profileImage: oldKey }, provider, other)
  await withHead(200, 'image/png', async heads => {
    for (const bad of ['data:image/png;base64,AAAA', pngKey('profile-image', other.email, 3), pngKey('service-image', client.email, 3)])
      await assert.rejects(run(client, withImage, () => actions.updateClientAccount({ profileImage: bad })), rejected())
    assert.equal(heads.length, 0)
    const saved = await run(client, withImage, () => actions.updateClientAccount({ profileImage: newKey }))
    assert.equal(saved.result.profileImage, newKey)
    assert.deepEqual(saved.deletes, [oldKey])
    const same = await run(client, withImage, () => actions.updateClientAccount({ firstName: 'Z', profileImage: oldKey }))
    assert.deepEqual(same.deletes, [])
    assert.equal(heads.length, 1)
    const legacy = 'data:image/png;base64,LEGACY'
    const withLegacy = storage => accounts(storage, { ...client, profileImage: legacy }, provider, other)
    const kept = await run(client, withLegacy, () => actions.updateClientAccount({ profileImage: legacy }))
    assert.equal(kept.result.profileImage, legacy)
    const replacedLegacy = await run(client, withLegacy, () => actions.updateClientAccount({ profileImage: newKey }))
    assert.deepEqual(replacedLegacy.deletes, [])
  })
  await withHead(404, '', async () => {
    await assert.rejects(run(client, withImage, () => actions.updateClientAccount({ profileImage: newKey })), rejected(400, /did not finish/))
  })
  await withHead(200, 'application/pdf', async () => {
    await assert.rejects(run(client, withImage, () => actions.updateClientAccount({ profileImage: newKey })), rejected(400, /did not finish/))
  })
})

test('provider logo replacement deletes the old logo', async () => {
  const oldKey = pngKey('profile-image', provider.email, 1), newKey = pngKey('profile-image', provider.email, 2)
  await withHead(200, 'image/webp', async () => {
    const saved = await run(provider, s => accounts(s, client, { ...provider, profileImage: oldKey }, other), () => actions.updateProviderAccount({ profileImage: newKey }))
    assert.equal(saved.result.profileImage, newKey)
    assert.deepEqual(saved.deletes, [oldKey])
  })
})

test('service saves verify image keys; replaced and dropped images are deleted and bookings follow', async () => {
  const keyA = pngKey('service-image', provider.email, 1), keyB = pngKey('service-image', provider.email, 2), keyC = pngKey('service-image', provider.email, 3)
  const base = { name: 'Sound', location: 'Town', price: 100, active: true }
  const setup = storage => {
    accounts(storage, client, approved, other)
    storage.setItem('soundstage-provider-services-v2:provider%40test.com', JSON.stringify([{ ...base, id: 's1', image: keyA }, { ...base, id: 's2', image: keyB }]))
    storage.setItem(bookingKey, JSON.stringify([{ id: 'b1', packageId: 's1', image: keyA, status: 'Pending' }]))
  }
  await withHead(200, 'image/png', async () => {
    for (const bad of ['data:image/png;base64,AAAA', pngKey('service-image', other.email, 4), pngKey('profile-image', provider.email, 4)])
      await assert.rejects(run(provider, setup, () => actions.saveProviderService({ ...base, id: 's3', image: bad })), rejected())
    const added = await run(provider, setup, () => actions.saveProviderService({ ...base, id: 's3', image: keyC }))
    assert.ok(JSON.parse(added.state.storage.getItem('soundstage-provider-services-v2:provider%40test.com')).some(s => s.id === 's3' && s.image === keyC))
    const updated = await run(provider, setup, () => actions.updateProviderServices([{ ...base, id: 's1', image: keyC }]))
    assert.deepEqual(updated.deletes.sort(), [keyA, keyB].sort())
    assert.equal(JSON.parse(updated.state.storage.getItem(bookingKey))[0].image, keyC)
    const unchanged = await run(provider, setup, () => actions.updateProviderServices([{ ...base, id: 's1', image: keyA }, { ...base, id: 's2', image: keyB }]))
    assert.deepEqual(unchanged.deletes, [])
    const renamed = await run(provider, setup, () => actions.updateProviderServices([{ ...base, id: 's1', image: keyA }, { ...base, id: 's2-new', image: keyB }]))
    assert.deepEqual(renamed.deletes, [])
    const shared = await run(provider, setup, () => actions.updateProviderServices([{ ...base, id: 's1', image: keyC }, { ...base, id: 's2', image: keyA }]))
    assert.deepEqual(shared.deletes, [keyB])
  })
  await withHead(404, '', async () => {
    await assert.rejects(run(provider, setup, () => actions.updateProviderServices([{ ...base, id: 's1', image: keyC }])), rejected(400, /did not finish/))
  })
})

test('provider application accepts only own uploaded document keys and deletes unused old ones', async () => {
  const oldKey = keys.buildKey('provider-document', provider.email, newId(1), 'application/pdf'), newKey = keys.buildKey('provider-document', provider.email, newId(2), 'application/pdf')
  const setup = storage => accounts(storage, client, { ...provider, application: { status: 'Rejected', submittedAt: 'x', reason: 'ID', documents: [{ name: 'old.pdf', type: 'application/pdf', key: oldKey, size: 10 }] } }, other)
  const doc = { name: 'permit.pdf', type: 'application/pdf', key: newKey, size: 10 }
  await withHead(200, 'application/pdf', async () => {
    for (const bad of [{ ...doc, key: 'data:application/pdf;base64,AA' }, { ...doc, key: keys.buildKey('provider-document', other.email, newId(3), 'application/pdf') }, { ...doc, key: pngKey('profile-image', provider.email, 3), type: 'image/png' }, { ...doc, data: 'data:application/pdf;base64,AA' }])
      await assert.rejects(run(provider, setup, () => actions.submitProviderApplication([bad])), error => error.status === 400)
    const saved = await run(provider, setup, () => actions.submitProviderApplication([doc]))
    const stored = JSON.parse(saved.state.storage.getItem('soundstage-accounts-v2')).find(a => a.email === provider.email)
    assert.equal(stored.application.status, 'Pending')
    assert.deepEqual(stored.application.documents, [doc])
    assert.deepEqual(saved.deletes, [oldKey])
  })
  await withHead(404, '', async () => {
    await assert.rejects(run(provider, setup, () => actions.submitProviderApplication([doc])), rejected(400, /did not finish/))
  })
})
