const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { readFileSync, readdirSync, statSync } = require('node:fs')
const paymongoFixture = require('./paymongo-fixture.cjs')()
const tx = Object.assign(async () => [], { json: value => value })
let failTransaction = false
const database = { getDatabase: () => ({ begin: async fn => { const result = await fn(tx); if (failTransaction) throw new Error('rollback'); return result } }) }
const load = require('./ts-loader.cjs')({ [path.resolve('lib/server/paymongo.ts')]: paymongoFixture, [path.resolve('lib/server/database.ts')]: database })
const { context, queueDelete } = load('lib/server/runtime.ts')
const { MemoryStorage } = load('lib/memory-storage.ts')
const keys = load('lib/server/file-keys.ts')
const r2 = load('lib/server/r2.ts')
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
  assert.match(readFileSync('lib/server/r2.ts', 'utf8'), /^import "server-only"/)
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
