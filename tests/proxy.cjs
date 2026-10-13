const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./ts-loader.cjs')

const originalPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
const originalSecretKey = process.env.CLERK_SECRET_KEY
const state = { auth: { userId: null, sessionClaims: null } }

class ResponseMock {
  constructor(body, init = {}) {
    this.body = body
    this.status = init.status || 200
    this.headers = new Headers(init.headers)
    this.kind = 'response'
  }
  static next(options) { return { kind: 'next', status: 200, options } }
  static redirect(url) { return { kind: 'redirect', status: 307, url: String(url) } }
}

const proxy = createLoader({
  '@clerk/nextjs/server': {
    clerkMiddleware: handler => (request, event) => handler(async () => state.auth, request, event),
  },
  'next/server': { NextResponse: ResponseMock },
})(path.resolve('proxy.ts')).default

after(() => {
  if (originalPublishableKey === undefined) delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  else process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = originalPublishableKey
  if (originalSecretKey === undefined) delete process.env.CLERK_SECRET_KEY
  else process.env.CLERK_SECRET_KEY = originalSecretKey
})

function request(pathname) {
  const url = new URL(pathname, 'http://localhost:3000')
  return { url: url.href, nextUrl: url, headers: new Headers({ 'x-pathname': '/spoofed' }) }
}

function configureKeys(enabled) {
  if (enabled) {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_proxy'
    process.env.CLERK_SECRET_KEY = 'sk_test_proxy'
  } else {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    delete process.env.CLERK_SECRET_KEY
  }
}

test('missing Clerk keys fail closed on protected paths and preserve public pages', async () => {
  configureKeys(false)
  const denied = await proxy(request('/admin'), {})
  assert.equal(denied.status, 503)
  assert.match(denied.body, /role="alert"/)
  assert.match(denied.body, /Sign-in is temporarily unavailable/)
  assert.equal((await proxy(request('/dashboard'), {})).status, 503)
  assert.equal((await proxy(request('/browse'), {})).kind, 'next')
})

test('signed-out protected requests redirect to login with path and query', async () => {
  configureKeys(true)
  state.auth = { userId: null, sessionClaims: null }
  const response = await proxy(request('/provider/services?a=1'), {})
  assert.equal(response.kind, 'redirect')
  assert.equal(new URL(response.url).pathname, '/login')
  assert.equal(new URL(response.url).searchParams.get('returnTo'), '/provider/services?a=1')
})

test('signed-out dashboard requests redirect directly to login', async () => {
  configureKeys(true)
  state.auth = { userId: null, sessionClaims: null }
  const response = await proxy(request('/dashboard'), {})
  assert.equal(response.kind, 'redirect')
  assert.equal(new URL(response.url).pathname, '/login')
  assert.equal(new URL(response.url).search, '')
})

test('a valid role claim redirects cross-role requests to its dashboard', async () => {
  configureKeys(true)
  state.auth = { userId: 'user_client', sessionClaims: { role: 'client' } }
  const response = await proxy(request('/admin/accounts'), {})
  assert.equal(response.kind, 'redirect')
  assert.equal(new URL(response.url).pathname, '/client')
})

test('missing claims pass to the authoritative layout with a replaced pathname header', async () => {
  configureKeys(true)
  state.auth = { userId: 'user_unknown', sessionClaims: {} }
  const response = await proxy(request('/payroll-master?period=current'), {})
  assert.equal(response.kind, 'next')
  assert.equal(response.options.request.headers.get('x-pathname'), '/payroll-master?period=current')
})

test('public paths do not call auth and continue normally', async () => {
  configureKeys(true)
  state.auth = null
  const response = await proxy(request('/browse'), {})
  assert.equal(response.kind, 'next')
})
