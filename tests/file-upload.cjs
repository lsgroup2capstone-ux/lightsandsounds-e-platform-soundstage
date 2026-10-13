const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./ts-loader.cjs')

const calls = []
const store = {
  getFilesBaseUrl: () => 'https://pub.r2.dev',
  mutate: async (action, args) => { calls.push([action, args]); return action === 'createUploadUrl' ? { key: 'public/profile/abc/0123456789abcdef0123456789abcdef.png', url: 'https://r2.test/put', headers: { 'Content-Type': 'image/png', 'Content-Length': '3' } } : undefined },
}
const { uploadFile, publicFileUrl } = createLoader({ [path.resolve('lib/app-store.ts')]: store })('lib/file-upload.ts')
const png = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })

// Mirrors a form handler: the save mutation only runs after the upload returns a key.
async function uploadThenSave(file) {
  const key = await uploadFile('profile-image', file)
  await store.mutate('updateClientAccount', [{ profileImage: key }])
}
async function withFetch(fetchImpl, fn) {
  const original = global.fetch
  global.fetch = fetchImpl
  calls.length = 0
  try { return await fn() } finally { global.fetch = original }
}

test('a failed PUT throws and no save mutation follows', async () => {
  for (const fetchImpl of [async () => new Response('', { status: 500 }), async () => { throw new TypeError('network') }]) {
    await withFetch(fetchImpl, async () => {
      await assert.rejects(uploadThenSave(png), { message: 'Upload failed. Please try again.' })
      assert.deepEqual(calls.map(([action]) => action), ['createUploadUrl'])
    })
  }
})

test('a successful PUT returns the key and sends the file without Content-Length', async () => {
  let request
  const key = await withFetch(async (url, options) => { request = { url, options }; return new Response('', { status: 200 }) }, () => uploadFile('profile-image', png))
  assert.equal(key, 'public/profile/abc/0123456789abcdef0123456789abcdef.png')
  assert.equal(request.url, 'https://r2.test/put')
  assert.equal(request.options.method, 'PUT')
  assert.equal(request.options.body, png)
  assert.deepEqual(request.options.headers, { 'Content-Type': 'image/png' })
})

test('type and size are checked before any request', async () => {
  await withFetch(async () => { throw new Error('should not fetch') }, async () => {
    await assert.rejects(uploadFile('profile-image', new File(['x'], 'a.gif', { type: 'image/gif' })), { message: 'Use a JPG, PNG or WebP image up to 5 MB.' })
    await assert.rejects(uploadFile('provider-document', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.pdf', { type: 'application/pdf' })), { message: 'Use a PDF, JPG or PNG up to 5 MB.' })
    assert.equal(calls.length, 0)
  })
})

test('publicFileUrl maps public keys and passes through data: and bundled paths', () => {
  assert.equal(publicFileUrl('public/service/x/y.png'), 'https://pub.r2.dev/public/service/x/y.png')
  assert.equal(publicFileUrl('data:image/png;base64,AA'), 'data:image/png;base64,AA')
  assert.equal(publicFileUrl('/images/pkg-band.webp'), '/images/pkg-band.webp')
  assert.equal(publicFileUrl('private/provider-docs/x/y.pdf'), '')
  assert.equal(publicFileUrl('//evil.test/x.png'), '')
  assert.equal(publicFileUrl(undefined), '')
})
