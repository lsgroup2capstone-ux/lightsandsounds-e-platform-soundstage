const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')
const createLoader = require('./ts-loader.cjs')

test('direct signup SMS pins phone, limits sends and attempts, expires codes, and prevents replay', async t => {
  const db = new PGlite()
  const originalFetch = global.fetch
  const originalToken = process.env.PHILSMS_API_TOKEN, originalSender = process.env.PHILSMS_SENDER_ID
  const originalDemo = process.env.ENABLE_DEMO_OTP, originalNodeEnv = process.env.NODE_ENV
  t.after(async () => {
    global.fetch = originalFetch
    for (const [key, value] of [['PHILSMS_API_TOKEN', originalToken], ['PHILSMS_SENDER_ID', originalSender], ['ENABLE_DEMO_OTP', originalDemo], ['NODE_ENV', originalNodeEnv]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
    await db.close()
  })
  process.env.PHILSMS_API_TOKEN = 'test-only-secret'
  delete process.env.ENABLE_DEMO_OTP
  process.env.PHILSMS_SENDER_ID = 'SoundStage'
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('database/schema.sql', 'utf8'))
  const tag = connection => async (parts, ...values) => (await connection.query(parts.reduce((s, p, i) => s + (i ? '$' + i : '') + p, ''), values)).rows
  const sql = tag(db)
  sql.begin = callback => db.transaction(tx => callback(tag(tx)))
  const sms = createLoader({ [path.resolve('lib/server/database.ts')]: { getDatabase: () => sql } })('lib/server/signup-sms.ts')
  const user = { id: '00000000-0000-0000-0000-000000000001', user_metadata: { mobile: '09171234567' } }
  const other = { id: '00000000-0000-0000-0000-000000000002', user_metadata: { mobile: '09171234567' } }
  for (const u of [user, other]) await db.query('insert into auth.users(id) values ($1)', [u.id])
  let code, calls = 0, fail = false
  global.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'https://dashboard.philsms.com/api/v3/sms/send')
    assert.equal(options.headers.Authorization, 'Bearer test-only-secret')
    const body = JSON.parse(options.body)
    assert.equal(body.recipient, '639171234567')
    code = body.message.match(/\b\d{6}\b/)[0]
    return Response.json(fail ? { status: 'error', message: 'private details' } : { status: 'success' })
  }
  assert.equal((await sms.signupPhoneStatus(user)).verified, false)
  await sms.sendSignupSms(user)
  const first = (await db.query('select * from soundstage.signup_phone_verifications')).rows[0]
  assert.ok(!JSON.stringify(first).includes(code))
  await assert.rejects(sms.sendSignupSms(user), e => e.status === 429)
  assert.equal(calls, 1)
  assert.equal(await sms.verifySignupSms(other, code), false)
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 5; i++) assert.equal(await sms.verifySignupSms(user, wrong), false)
  assert.equal(await sms.verifySignupSms(user, code), false)
  await db.query("update soundstage.signup_phone_verifications set sent_at=now()-interval '61 seconds' where auth_id=$1", [user.id])
  user.user_metadata.mobile = '09181234567'
  await sms.sendSignupSms(user)
  assert.equal((await sms.signupPhoneStatus(user)).phone, '+639171234567')
  await db.query("update soundstage.signup_phone_verifications set expires_at=now()-interval '1 second' where auth_id=$1", [user.id])
  assert.equal(await sms.verifySignupSms(user, code), false)
  await db.query("update soundstage.signup_phone_verifications set sent_at=now()-interval '61 seconds' where auth_id=$1", [user.id])
  fail = true
  await assert.rejects(sms.sendSignupSms(user), e => e.status === 502 && !e.message.includes('private details'))
  assert.equal(await sms.verifySignupSms(user, code), false)
  await assert.rejects(sms.sendSignupSms(user), e => e.status === 429)
  fail = false
  await db.query("update soundstage.signup_phone_verifications set sent_at=now()-interval '61 seconds' where auth_id=$1", [user.id])
  await sms.sendSignupSms(user)
  assert.equal(await sms.verifySignupSms(user, code), true)
  assert.equal(await sms.hasVerifiedSignupPhone(user.id), true)
  assert.equal(await sms.verifySignupSms(user, code), false)
  const before = calls
  assert.equal((await sms.sendSignupSms(user)).verified, true)
  assert.equal(calls, before)
  await db.query('update soundstage.signup_phone_verifications set send_count=5 where auth_id=$1', [user.id])
  await assert.rejects(sms.sendSignupSms(other), e => e.status === 429)
  assert.equal(calls, before)
  // Demo needs no provider credentials, cannot send SMS, and never verifies in production.
  const demoUser = { id: '00000000-0000-0000-0000-000000000003', user_metadata: { mobile: '09191234567' } }
  await db.query('insert into auth.users(id) values ($1)', [demoUser.id])
  process.env.ENABLE_DEMO_OTP = 'true'
  process.env.NODE_ENV = 'development'
  delete process.env.PHILSMS_API_TOKEN
  delete process.env.PHILSMS_SENDER_ID
  const demoResult = await sms.sendSignupSms(demoUser)
  assert.equal(demoResult.demoCode, '123456')
  assert.equal(calls, before)
  assert.equal((await sms.signupPhoneStatus(demoUser)).demoCode, '123456')
  assert.equal(await sms.verifySignupSms(demoUser, '654321'), false)
  process.env.NODE_ENV = 'production'
  assert.equal(sms.demoSignupOtpEnabled(), false)
  assert.equal((await sms.signupPhoneStatus(demoUser)).demoCode, undefined)
  assert.equal(await sms.verifySignupSms(demoUser, '123456'), false)
  process.env.NODE_ENV = 'development'
  assert.equal(await sms.verifySignupSms(demoUser, '123456'), true)
  assert.equal(await sms.hasVerifiedSignupPhone(demoUser.id), true)
  process.env.ENABLE_DEMO_OTP = 'false'
  assert.equal(await sms.hasVerifiedSignupPhone(demoUser.id), false)
  assert.equal((await sms.signupPhoneStatus(demoUser)).verified, false)
  process.env.ENABLE_DEMO_OTP = 'true'
  process.env.NODE_ENV = 'production'
  assert.equal(await sms.hasVerifiedSignupPhone(demoUser.id), false)
})

test('signup SMS endpoint requires a session and rejects phone changes', async () => {
  let user = null, sends = 0
  class RequestError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
  class SmsVerificationError extends Error {}
  const { POST } = createLoader({
    [path.resolve('lib/server/data-service.ts')]: { authenticate: async () => user, RequestError },
    [path.resolve('lib/server/signup-sms.ts')]: { SmsVerificationError, sendSignupSms: async () => { sends++; return { verified: false } } },
  })('app/api/auth/signup-sms/route.ts')
  const req = input => new Request('https://example.test/api/auth/signup-sms', { method: 'POST', body: JSON.stringify(input) })
  assert.equal((await POST(req({ action: 'send' }))).status, 401)
  user = { id: 'test' }
  assert.equal((await POST(req({ action: 'send', phone: '+639181234567' }))).status, 400)
  assert.equal(sends, 0)
  assert.equal((await POST(req({ action: 'send' }))).status, 200)
  assert.equal(sends, 1)
})
