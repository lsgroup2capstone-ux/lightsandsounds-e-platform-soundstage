const { test } = require('node:test')
const assert = require('node:assert/strict')
const createLoader = require('./ts-loader.cjs')

test('Supabase fallback requires a verified email', async () => {
  let user = { id: 'test', email: 'test@example.com', email_confirmed_at: '2026-01-01', app_metadata: {}, user_metadata: { role: 'admin' } }
  const { authenticate } = createLoader({ '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) } })('lib/server/data-service.ts')
  const request = new Request('https://example.test/api/data', { headers: { Authorization: 'Bearer test' } })
  assert.equal((await authenticate(request)).id, 'test')
  user.email_confirmed_at = null
  await assert.rejects(authenticate(request), /verified account/)
  user = null
  await assert.rejects(authenticate(request), /verified account/)
  assert.equal(await authenticate(new Request('https://example.test/api/data')), null)
})
