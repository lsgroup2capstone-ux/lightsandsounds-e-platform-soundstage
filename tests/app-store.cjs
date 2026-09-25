const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./ts-loader.cjs')

test('concurrent refreshes share a request, while writes retain their ordering', async () => {
  const originalFetch = global.fetch
  const previousKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  global.sessionStorage = { getItem: () => null }
  global.window = { dispatchEvent() {} }
  const calls = []
  let release
  const blocked = new Promise(resolve => { release = resolve })
  global.fetch = async (_url, options) => {
    calls.push(options.method)
    if (calls.length === 1) await blocked
    return Response.json({ records: { 'soundstage-test': String(calls.length) }, session: {}, result: 'saved' })
  }
  try {
    const store = createLoader({ [path.resolve('lib/supabase.ts')]: { getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: null }, error: null }) } }) } })('lib/app-store.ts')
    const refreshes = Array.from({ length: 20 }, () => store.refreshStore())
    assert.ok(refreshes.every(promise => promise === refreshes[0]))
    const write = store.mutate('save', [])
    const afterWrite = store.refreshStore()
    assert.notEqual(afterWrite, refreshes[0])
    release()
    await Promise.all([...refreshes, write, afterWrite])
    assert.deepEqual(calls, ['GET', 'POST', 'GET'])
    assert.equal(store.appStorage.getItem('soundstage-test'), '3')
    await store.refreshStore()
    assert.equal(calls.length, 4)
  } finally {
    global.fetch = originalFetch
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previousKey
  }
})

test('session reset discards an old response and failed refreshes can retry', async () => {
  const originalFetch = global.fetch
  global.sessionStorage = { getItem: () => null }
  global.window = { dispatchEvent() {} }
  let release, started
  const waiting = new Promise(resolve => { started = resolve })
  global.fetch = async () => { started(); return new Promise(resolve => { release = () => resolve(Response.json({ records: { private: 'old user' }, session: {} })) }) }
  try {
    const store = createLoader({ [path.resolve('lib/supabase.ts')]: { getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'test' } }, error: null }) } }) } })('lib/app-store.ts')
    const old = store.refreshStore()
    await waiting
    store.resetStore()
    release()
    await old
    assert.equal(store.appStorage.getItem('private'), null)
    global.fetch = async () => Response.json({ error: 'Temporary failure' }, { status: 503 })
    await assert.rejects(store.refreshStore(), /Temporary failure/)
    global.fetch = async () => Response.json({ records: { public: 'new' }, session: {} })
    await store.refreshStore()
    assert.equal(store.appStorage.getItem('public'), 'new')
  } finally { global.fetch = originalFetch }
})
