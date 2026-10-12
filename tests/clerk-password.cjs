const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./ts-loader.cjs')
const { MemoryStorage } = createLoader()('lib/memory-storage.ts')
function fixture(role = 'client') {
  global.sessionStorage = new MemoryStorage()
  const calls = [], redirects = [], account = { role, email: role + '@example.com' }
  global.location = { origin: 'https://soundstage.test', assign: url => redirects.push(url) }
  const signIn = {
    id: 'attempt-1', identifier: account.email, status: 'needs_first_factor',
    async create(input) { calls.push(['create', input]); this.identifier = input.identifier; this.status = input.strategy === 'password' ? 'complete' : 'needs_first_factor'; return { ...this, createdSessionId: 'session-1' } },
    async attemptFirstFactor(input) { calls.push(['verify', input]); if (input.code !== '123456') throw new Error('Invalid code'); this.status = 'needs_new_password'; return this },
    async resetPassword(input) { calls.push(['reset', input]); this.status = 'complete'; return { ...this, createdSessionId: 'reset-session' } },
    async authenticateWithRedirect(input) { calls.push(['oauth', input]) },
  }
  const signUp = {
    id: 'signup-1',
    async create(input) { calls.push(['signup', input]) },
    async prepareEmailAddressVerification(input) { calls.push(['send', input]) },
    async attemptEmailAddressVerification(input) { if (input.code !== '123456') throw new Error('Invalid code'); return { status: 'complete', createdSessionId: 'session-1' } },
  }
  const clerk = { client: { signIn, signUp, resetSignIn() { calls.push(['clear-signin']); signIn.status = 'needs_first_factor' } }, async setActive(input) { calls.push(['activate', input]) }, async signOut(callback, options) { calls.push(['end-sessions', typeof callback, options]); if (typeof callback === 'function') await callback() } }
  const api = {
    async signInWithPassword(input) { calls.push(['supabase-login', input]); if (input.password !== 'Correct-pass1!') return { error: new Error('Invalid login credentials') }; return { data: { user: { app_metadata: { role } } } } },
    async signOut() { calls.push(['supabase-signout']); return {} },
  }
  const appStorage = new MemoryStorage(), sessionView = new MemoryStorage()
  const store = { appStorage, sessionView,
    resetStore() { appStorage.clear(); sessionView.clear() },
    async refreshStore() {
      appStorage.setItem(role === 'admin' ? 'soundstage-admin-account' : 'soundstage-accounts-v2', JSON.stringify(role === 'admin' ? account : [account]))
      sessionView.setItem('soundstage-session', JSON.stringify(account))
    },
    async mutate(...args) { calls.push(['mutate', ...args]) },
  }
  const auth = createLoader({
    [path.resolve('lib/clerk-browser.ts')]: { getClerkBrowser: async () => clerk, signOutClerk: async () => calls.push(['clerk-signout']) },
    [path.resolve('lib/supabase.ts')]: { getSupabase: () => ({ auth: api }) },
    [path.resolve('lib/app-store.ts')]: store,
  })('lib/client-auth.ts')
  return { auth, api, store, clerk, signIn, signUp, calls, redirects, account }
}
test('both roles sign up in Clerk, verify email and retain provider documents', async () => {
  for (const role of ['client', 'provider']) {
    const { auth, calls, account } = fixture(role)
    const documents = [{ name: 'permit.pdf', type: 'application/pdf', key: 'private/provider-docs/owner/file.pdf', size: 10 }]
    const profile = { ...account, firstName: 'Test', lastName: 'User', mobile: '09171234567', ...(role === 'provider' ? { application: { documents } } : {}) }
    await assert.rejects(auth.savePendingAccount({ ...profile, role: 'admin' }, 'Correct-pass1!'), /Administrator/)
    assert.equal(await auth.savePendingAccount(profile, 'Correct-pass1!'), false)
    assert.equal(calls[0][1].emailAddress, account.email)
    assert.equal(calls[0][1].unsafeMetadata.mobile, '+639171234567')
    assert.equal(sessionStorage.getItem('soundstage-oauth-role'), role)
    assert.ok(!JSON.stringify(sessionStorage.values).includes('Correct-pass1!'))
    await auth.resendVerification()
    assert.deepEqual(calls[1], ['send', { strategy: 'email_code' }])
    await assert.rejects(auth.verifyPendingAccount('654321'), /Invalid/)
    assert.equal(await auth.verifyPendingAccount('123456'), true)
    assert.equal(sessionStorage.getItem('soundstage-signup-email'), null)
    assert.ok(calls.some(c => c[0] === 'activate'))
    assert.ok(calls.some(c => c[0] === 'supabase-signout'))
    if (role === 'provider') assert.deepEqual(calls.find(c => c[0] === 'mutate'), ['mutate', 'submitProviderApplication', [documents]])
  }
})
test('Clerk password login returns saved roles and delegates extra verification', async () => {
  for (const role of ['client', 'provider']) {
    const { auth, calls, signIn, redirects, account } = fixture(role)
    assert.equal(await auth.loginWithEmailAutomatically(' ' + account.email.toUpperCase() + ' ', 'password'), role)
    assert.equal(calls[0][1].identifier, account.email)
    assert.equal(calls.some(c => c[0] === 'supabase-login'), false)
    const activation = calls.find(c => c[0] === 'activate')[1]
    assert.equal(typeof activation.navigate, 'function')
    await activation.navigate({ session: { status: 'active' } })
    assert.deepEqual(redirects, [])
    for (const status of ['needs_second_factor', 'needs_client_trust', 'needs_new_password']) {
      signIn.create = async () => ({ status })
      assert.equal(await auth.loginWithEmailAutomatically(account.email, 'password'), null)
      assert.equal(redirects.at(-1), '/auth/clerk/continue')
    }
  }
})
test('Clerk recovery rejects missing, invalid, swapped, resent and reused attempts', async () => {
  for (const role of ['client', 'provider']) {
    const { auth, calls, account, signIn } = fixture(role)
    await auth.requestPasswordReset(' ' + account.email.toUpperCase() + ' ')
    assert.deepEqual(calls[0], ['create', { strategy: 'reset_password_email_code', identifier: account.email }])
    assert.equal(await auth.completePasswordReset('new-password'), false)
    assert.equal(await auth.verifyPasswordResetCode('abc123'), false)
    await assert.rejects(auth.verifyPasswordResetCode('654321'), /Invalid code/)
    assert.equal(await auth.verifyPasswordResetCode('123456'), true)
    signIn.id = 'other'
    assert.equal(await auth.completePasswordReset('new-password'), false)
    signIn.id = 'attempt-1'; signIn.identifier = 'other@example.com'
    assert.equal(await auth.completePasswordReset('new-password'), false)
    signIn.identifier = account.email
    await auth.requestPasswordReset(account.email)
    assert.equal(await auth.completePasswordReset('new-password'), false)
    await auth.verifyPasswordResetCode('123456')
    await assert.rejects(auth.completePasswordReset('short'), /eight/)
    sessionStorage.setItem('soundstage-login-email', account.email)
    sessionStorage.setItem('soundstage-google-return-to', '/provider')
    assert.equal(await auth.completePasswordReset('new-password'), true)
    assert.deepEqual(calls.find(c => c[0] === 'reset'), ['reset', { password: 'new-password', signOutOfOtherSessions: true }])
    assert.ok(calls.some(c => c[0] === 'supabase-signout'))
    assert.deepEqual(calls.find(c => c[0] === 'end-sessions'), ['end-sessions', 'function', undefined])
    assert.ok(calls.some(c => c[0] === 'clear-signin'))
    assert.equal(calls.some(c => c[0] === 'activate' || c[0] === 'supabase-login'), false)
    assert.equal(sessionStorage.getItem('soundstage-login-email'), null)
    assert.equal(sessionStorage.getItem('soundstage-google-return-to'), null)
    assert.equal(auth.getAccount(), null)
    assert.equal(await auth.completePasswordReset('new-password'), false)
    assert.ok(!JSON.stringify(sessionStorage.values).includes('new-password'))
  }
})
test('password reset does not report success when its new session cannot be ended', async () => {
  const { auth, clerk, calls, account } = fixture()
  await auth.requestPasswordReset(account.email)
  await auth.verifyPasswordResetCode('123456')
  clerk.signOut = async () => { throw new Error('Session could not be ended') }
  await assert.rejects(auth.completePasswordReset('new-password'), /Session could not be ended/)
  assert.equal(calls.some(c => c[0] === 'activate' || c[0] === 'supabase-login'), false)
})

test('reset signs out all sessions even without an active session or returned session ID', async () => {
  const { auth, clerk, signIn, calls, account } = fixture()
  assert.equal(clerk.session, undefined)
  signIn.resetPassword = async () => ({ status: 'needs_second_factor', createdSessionId: null })
  await auth.requestPasswordReset(account.email)
  await auth.verifyPasswordResetCode('123456')
  assert.equal(await auth.completePasswordReset('new-password'), true)
  assert.deepEqual(calls.find(c => c[0] === 'end-sessions'), ['end-sessions', 'function', undefined])
  assert.ok(calls.some(c => c[0] === 'clear-signin'))
  assert.equal(calls.some(c => c[0] === 'activate' || c[0] === 'supabase-login'), false)
  assert.equal(auth.getAccount(), null)
})
test('Google uses Clerk OAuth and rejects unsafe destinations and admin signup', async () => {
  const { auth, calls } = fixture()
  await auth.loginWithGoogle('provider', '/provider/application')
  assert.deepEqual(calls.find(c => c[0] === 'oauth'), ['oauth', { strategy: 'oauth_google', redirectUrl: '/auth/clerk/callback', redirectUrlComplete: '/auth/clerk/complete' }])
  assert.equal(sessionStorage.getItem('soundstage-oauth-role'), 'provider')
  assert.equal(sessionStorage.getItem('soundstage-google-return-to'), '/provider/application')
  await auth.loginWithGoogle('client', '//evil.test')
  assert.equal(sessionStorage.getItem('soundstage-google-return-to'), null)
  await assert.rejects(auth.loginWithGoogle('admin'), /Administrator/)
})
test('administrator login stays on Supabase and rejects ordinary accounts', async () => {
  const { auth, calls } = fixture('admin')
  assert.equal(await auth.loginWithEmailAutomatically(' ADMIN@soundstage.local ', 'Correct-pass1!'), 'admin')
  assert.equal(calls.some(c => c[0] === 'create'), false)
  assert.equal(calls.find(c => c[0] === 'supabase-login')[1].email, 'admin@soundstage.local')
  const ordinary = fixture('provider')
  await assert.rejects(ordinary.auth.loginWithAdmin('provider@example.com', 'Correct-pass1!'), /Administrator/)
})
test('legacy Supabase fallback only handles missing users or wrong passwords and clears failed sessions', async () => {
  for (const role of ['client', 'provider', 'admin']) {
    const { auth, signIn, store, calls, account } = fixture(role)
    signIn.create = async () => { throw { errors: [{ code: 'form_identifier_not_found' }] } }
    await assert.rejects(auth.loginWithEmailAutomatically(account.email, 'wrong'), /Invalid login/)
    assert.equal(await auth.loginWithEmailAutomatically(account.email, 'Correct-pass1!'), role)
    store.refreshStore = async () => { throw new Error('Database unavailable') }
    await assert.rejects(auth.loginWithEmailAutomatically(account.email, 'Correct-pass1!'), /Database unavailable/)
    assert.equal(auth.getAccount(), null)
    const before = calls.length
    for (const code of ['too_many_requests', 'network_error', 'user_locked']) {
      const error = { errors: [{ code }] }
      signIn.create = async () => { throw error }
      await assert.rejects(auth.loginWithEmailAutomatically(account.email, 'Correct-pass1!'), value => value === error)
    }
    assert.equal(calls.length, before)
  }
})
test('signup enforces password rules before contacting Clerk', async () => {
  const { auth, calls, account } = fixture()
  for (const password of ['', 'Aa1!abc', 'lowercase1!', 'UPPERCASE1!', 'NoNumbers!', 'NoSpecial123']) {
    await assert.rejects(auth.savePendingAccount({ ...account, mobile: '09171234567' }, password), /at least 8 characters/)
  }
  assert.equal(calls.length, 0)
})
