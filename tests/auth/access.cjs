const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const createLoader = require('../helpers/ts-loader.cjs')

const originalPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
const originalSecretKey = process.env.CLERK_SECRET_KEY
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_access'
process.env.CLERK_SECRET_KEY = 'sk_test_access'

const state = {
  auth: { userId: 'user_client', sessionId: 'session_client', sessionClaims: { role: 'client' } },
  path: '/client',
  profile: { clerkUserId: 'user_client', email: 'client@example.com', firstName: 'Client', lastName: 'Test', phone: '', role: 'client', status: 'active' },
  profileError: null,
  revokeError: null,
  mirrorError: null,
  revoked: [],
  mirrored: [],
  warnings: [],
}

class RedirectError extends Error {
  constructor(to) { super(`redirect:${to}`); this.to = to }
}

const profilePath = path.resolve('lib/server/auth/profiles.ts')
const databasePath = path.resolve('lib/server/db/database.ts')
const access = createLoader({
  '@clerk/nextjs/server': {
    auth: async () => state.auth,
    clerkClient: async () => ({ sessions: { revokeSession: async id => { if (state.revokeError) throw state.revokeError; state.revoked.push(id) } } }),
  },
  'next/headers': { headers: async () => new Headers({ 'x-pathname': state.path }) },
  'next/navigation': { redirect: to => { throw new RedirectError(to) } },
  [databasePath]: { getDatabase: () => ({ kind: 'database' }) },
  [profilePath]: {
    findProfileByClerkId: async () => {
      if (state.profileError) throw state.profileError
      return state.profile
    },
    mirrorRole: async (id, role) => { if (state.mirrorError) return false; state.mirrored.push({ id, role }); return true },
  },
})(path.resolve('lib/server/auth/access.ts'))

const originalWarn = console.warn
console.warn = (...values) => state.warnings.push(values.join(' '))

after(() => {
  console.warn = originalWarn
  if (originalPublishableKey === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalPublishableKey
  if (originalSecretKey === undefined) delete process.env.CLERK_SECRET_KEY
  else process.env.CLERK_SECRET_KEY = originalSecretKey
})

function reset() {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_access'
  process.env.CLERK_SECRET_KEY = 'sk_test_access'
  state.auth = { userId: 'user_client', sessionId: 'session_client', sessionClaims: { role: 'client' } }
  state.path = '/client'
  state.profile = { clerkUserId: 'user_client', email: 'client@example.com', firstName: 'Client', lastName: 'Test', phone: '', role: 'client', status: 'active' }
  state.profileError = null
  state.revokeError = null
  state.mirrorError = null
  state.revoked.length = 0
  state.mirrored.length = 0
  state.warnings.length = 0
}

async function expectRedirect(action, to) {
  await assert.rejects(action, error => error instanceof RedirectError && error.to === to)
}

test('getCurrentProfile and hasRole expose the authoritative profile', async () => {
  reset()
  const current = await access.getCurrentProfile()
  assert.equal(current.session.claimRole, 'client')
  assert.equal(current.profile.role, 'client')
  assert.equal(current.error, false)
  assert.equal(access.hasRole(current.profile, 'client'), true)
  assert.equal(access.hasRole(current.profile, 'admin', 'provider'), false)
  state.auth = { userId: null, sessionId: null, sessionClaims: null }
  assert.equal(await access.getCurrentProfile(), null)
})

test('requireRole fails closed when Clerk keys are unavailable', async () => {
  reset()
  delete process.env.CLERK_SECRET_KEY
  assert.deepEqual(await access.requireRole('client'), { kind: 'unavailable' })
  assert.match(state.warnings.at(-1), /access-denied client unavailable/)
})

test('requireRole redirects signed-out visitors with the full safe request path', async () => {
  reset()
  state.path = '/provider/services?a=1'
  state.auth = { userId: null, sessionId: null, sessionClaims: null }
  await expectRedirect(() => access.requireRole('provider'), '/login?returnTo=%2Fprovider%2Fservices%3Fa%3D1')
})

test('requireRole redirects wrong roles without rendering the requested area', async () => {
  reset()
  state.path = '/admin/accounts'
  await expectRedirect(() => access.requireRole('admin'), '/client')
})

test('requireRole sends a missing profile through completion', async () => {
  reset()
  state.path = '/client?tab=payments'
  state.profile = null
  await expectRedirect(() => access.requireRole('client'), '/auth/clerk/complete?returnTo=%2Fclient%3Ftab%3Dpayments')
})

test('requireRole revokes an inactive session and redirects with its status', async () => {
  reset()
  state.profile = { ...state.profile, status: 'suspended' }
  await expectRedirect(() => access.requireRole('client'), '/login?status=suspended')
  assert.deepEqual(state.revoked, ['session_client'])

  reset()
  state.profile = { ...state.profile, status: 'deactivated' }
  await expectRedirect(() => access.requireRole('client'), '/login?status=deactivated')
  assert.deepEqual(state.revoked, ['session_client'])
})

test('requireRole stays fail-closed when an inactive session cannot be revoked', async () => {
  reset()
  state.profile = { ...state.profile, status: 'suspended' }
  state.revokeError = new Error('Clerk unavailable')
  assert.deepEqual(await access.requireRole('client'), { kind: 'error' })
  assert.deepEqual(state.revoked, [])
  assert.equal(state.warnings.some(line => line === 'access-denied client revoke-failed'), true)
})

test('requireRole denies a profile lookup failure with an error decision', async () => {
  reset()
  state.profileError = new Error('database unavailable')
  assert.deepEqual(await access.requireRole('client'), { kind: 'error' })
  assert.equal(state.warnings.some(line => line === 'access-denied client profile-lookup-failed'), true)
  assert.equal(state.warnings.some(line => line === 'access-denied client error'), true)
})

test('requireRole repairs a stale claim before asking the browser to refresh', async () => {
  reset()
  state.auth.sessionClaims = { role: 'provider' }
  assert.deepEqual(await access.requireRole('client'), { kind: 'refresh', to: '/client' })
  assert.deepEqual(state.mirrored, [{ id: 'user_client', role: 'client' }])

  reset()
  state.path = '/provider'
  state.auth.sessionClaims = { role: 'provider' }
  assert.deepEqual(await access.requireRole('provider'), { kind: 'refresh', to: '/client' })
  assert.deepEqual(state.mirrored, [{ id: 'user_client', role: 'client' }])
})

test('requireRole renders an error instead of looping when role mirroring fails', async () => {
  reset()
  state.auth.sessionClaims = { role: 'provider' }
  state.mirrorError = new Error('Clerk unavailable')
  assert.deepEqual(await access.requireRole('client'), { kind: 'error' })

  reset()
  state.path = '/provider'
  state.auth.sessionClaims = { role: 'provider' }
  state.mirrorError = new Error('Clerk unavailable')
  assert.deepEqual(await access.requireRole('provider'), { kind: 'error' })
  assert.equal(state.warnings.some(line => line === 'access-denied provider role-mirror-failed'), true)
})

test('routeDashboard maps every role, preserves client tabs, and validates returnTo', () => {
  reset()
  const profile = role => ({ ...state.profile, role })
  assert.equal(access.routeDashboard(null, { signedIn: false }), '/login')
  assert.equal(access.routeDashboard(null, { signedIn: true }), '/auth/clerk/complete')
  assert.equal(access.routeDashboard(profile('client'), { signedIn: true }), '/client')
  assert.equal(access.routeDashboard(profile('provider'), { signedIn: true }), '/provider')
  assert.equal(access.routeDashboard(profile('payroll_master'), { signedIn: true }), '/payroll-master')
  assert.equal(access.routeDashboard(profile('admin'), { signedIn: true }), '/admin')
  assert.equal(access.routeDashboard(profile('client'), { signedIn: true, tab: 'payments' }), '/client?tab=payments')
  assert.equal(access.routeDashboard(profile('admin'), { signedIn: true, returnTo: '/admin/accounts' }), '/admin/accounts')
  assert.equal(access.routeDashboard(profile('client'), { signedIn: true, returnTo: '/browse' }), '/browse')
  for (const returnTo of ['//evil.example', '/\\evil.example', '/admin', '/dashboard']) {
    assert.equal(access.routeDashboard(profile('client'), { signedIn: true, returnTo }), '/client')
  }
  assert.equal(access.routeDashboard({ ...profile('client'), status: 'suspended' }, { signedIn: true }), '/login?status=suspended')
})

test('all protected layouts delegate their own role to requireRole', () => {
  const layouts = [
    ['app/(client)/client/layout.tsx', 'client'],
    ['app/(hubs)/provider/layout.tsx', 'provider'],
    ['app/(hubs)/payroll-master/layout.tsx', 'payroll_master'],
    ['app/(hubs)/admin/layout.tsx', 'admin'],
  ]
  for (const [filename, role] of layouts) {
    const source = readFileSync(filename, 'utf8')
    assert.match(source, new RegExp(`requireRole\\(\\"${role}\\"\\)`), filename)
    assert.doesNotMatch(source, /profile\s*\.\s*role|sessionClaims|publicMetadata/, filename)
  }
})

test('sign-in completion and login messaging route through the server dashboard', () => {
  const loginForm = readFileSync('components/auth/login-form.tsx', 'utf8')
  const completion = readFileSync('app/(auth)/auth/clerk/complete/page.tsx', 'utf8')
  const loginPage = readFileSync('app/(auth)/login/page.tsx', 'utf8')
  assert.match(loginForm, /`\/dashboard\$\{returnTo/)
  assert.doesNotMatch(loginForm, /startsWith\(\"\/\"\)/)
  assert.match(completion, /new URLSearchParams\(location\.search\)/)
  assert.match(completion, /`\/dashboard\$\{returnTo/)
  assert.match(loginPage, /This account is suspended\./)
  assert.match(loginPage, /This account is deactivated\./)
})
