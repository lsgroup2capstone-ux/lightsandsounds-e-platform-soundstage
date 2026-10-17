const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('../helpers/ts-loader.cjs')

test('data API verifies Clerk bearer sessions and rejects invalid or unconfigured sessions', async () => {
  const previousSecret = process.env.CLERK_SECRET_KEY
  const previousKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  process.env.CLERK_SECRET_KEY = 'test-secret'
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'test-key'
  let valid = true
  const identity = { id: 'user_test', authSource: 'clerk', email: 'client@example.com' }
  const { authenticate } = createLoader({
    [path.resolve('lib/server/auth/clerk-auth.ts')]: { authenticateClerk: async () => { if (!valid) throw new Error('Invalid'); return identity } },
    '@supabase/supabase-js': { createClient: () => { throw new Error('Clerk sessions must not use Supabase Auth') } },
  })('lib/server/data-service.ts')
  const request = new Request('http://localhost:3000/api/data', { headers: { Authorization: 'Bearer clerk-token', 'X-Auth-Provider': 'clerk' } })
  try {
    assert.equal(await authenticate(request), identity)
    valid = false
    await assert.rejects(authenticate(request), /could not be verified/)
    delete process.env.CLERK_SECRET_KEY
    await assert.rejects(authenticate(request), /not configured/)
  } finally {
    if (previousSecret === undefined) delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = previousSecret
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = previousKey
  }
})

test('Clerk requires an active verified email identity and ignores editable roles', async () => {
  let valid = true
  const user = { id: 'user_test', createdAt: Date.now(), primaryEmailAddressId: 'email_1', firstName: 'Test', lastName: 'User', emailAddresses: [{ id: 'email_1', emailAddress: 'Test@example.com', verification: { status: 'verified' } }], externalAccounts: [{ provider: 'oauth_google', emailAddress: 'Test@example.com', verification: { status: 'verified' } }], unsafeMetadata: { role: 'admin' }, publicMetadata: { role: 'admin' } }
  const session = { userId: user.id, status: 'active' }
  let options
  const { authenticateClerk } = createLoader({ '@clerk/nextjs/server': { createClerkClient: () => ({
    authenticateRequest: async (_req, opts) => { options = opts; return { toAuth: () => valid ? { userId: user.id, sessionId: 'sess_test' } : null } },
    users: { getUser: async () => user }, sessions: { getSession: async () => session },
  }) } })('lib/server/auth/clerk-auth.ts')
  const req = new Request('http://localhost:3000/api/data', { headers: { Authorization: 'Bearer test' } })
  const result = await authenticateClerk(req)
  assert.equal(result.authSource, 'clerk')
  assert.equal(result.email, 'test@example.com')
  assert.deepEqual(result.app_metadata, { provider: 'google' })
  assert.equal(result.user_metadata.role, undefined)
  assert.equal(options.acceptsToken, 'session_token')
  assert.ok(options.authorizedParties.includes('http://localhost:3000'))
  valid = false
  await assert.rejects(authenticateClerk(req), /Invalid Clerk session/)
  valid = true; session.status = 'revoked'
  await assert.rejects(authenticateClerk(req), /Inactive/)
  session.status = 'active'; user.emailAddresses[0].verification.status = 'unverified'
  await assert.rejects(authenticateClerk(req), /verified email/)
  user.emailAddresses[0].verification.status = 'verified'; user.externalAccounts[0].provider = 'github'
  assert.equal((await authenticateClerk(req)).app_metadata.provider, 'email')
  user.externalAccounts = []
  assert.equal((await authenticateClerk(req)).app_metadata.provider, 'email')
  user.locked = true
  await assert.rejects(authenticateClerk(req), /Inactive/)
})

