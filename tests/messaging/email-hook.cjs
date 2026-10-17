const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Webhook } = require('standardwebhooks')
const createLoader = require('../helpers/ts-loader.cjs')

test('Gmail hook sends signed recovery codes only and protects secrets on errors', async t => {
  const keys = ['GMAIL_SMTP_USER', 'GMAIL_SMTP_APP_PASSWORD', 'SUPABASE_SEND_EMAIL_HOOK_SECRET']
  const previous = keys.map(key => process.env[key])
  t.after(() => keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i] }))
  const secret = Buffer.alloc(32, 9).toString('base64')
  process.env.GMAIL_SMTP_USER = 'sender@gmail.com'
  process.env.GMAIL_SMTP_APP_PASSWORD = 'test app password'
  process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET = `v1,whsec_${secret}`
  const hook = new Webhook(secret)
  let calls = [], config, fail = false
  const { POST } = createLoader({ nodemailer: { createTransport: options => {
    config = options
    return { sendMail: async mail => { if (fail) throw new Error('private SMTP credentials'); calls.push(mail) }, close() {} }
  } } })('app/api/auth/send-email/route.ts')
  const payload = { user: { email: 'client@example.com' }, email_data: { email_action_type: 'recovery', token: '012345' } }
  function request(event = payload, timestamp = new Date(), invalid = false) {
    const body = JSON.stringify(event)
    return new Request('https://example.test/api/auth/send-email', { method: 'POST', body, headers: {
      'webhook-id': 'test-email', 'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': invalid ? 'v1,invalid' : hook.sign('test-email', timestamp, body),
    } })
  }
  assert.equal((await POST(request(payload, new Date(), true))).status, 401)
  assert.equal((await POST(request(payload, new Date(Date.now() - 600000)))).status, 401)
  assert.equal((await POST(request({ ...payload, user: { email: 'one@example.com,two@example.com' } }))).status, 400)
  for (const token of ['12345', '1234567', '<script>', 123456]) {
    assert.equal((await POST(request({ ...payload, email_data: { ...payload.email_data, token } }))).status, 400)
  }
  assert.equal(calls.length, 0)
  const response = await POST(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {})
  assert.equal(config.host, 'smtp.gmail.com')
  assert.equal(config.port, 465)
  assert.equal(config.secure, true)
  assert.equal(calls[0].to.address, 'client@example.com')
  assert.match(calls[0].text, /012345/)
  assert.doesNotMatch(calls[0].html, /href|https?:|ConfirmationURL/)
  assert.equal((await POST(request({ ...payload, user: { email: 'provider@example.com' } }))).status, 200)
  assert.equal(calls[1].to.address, 'provider@example.com')
  assert.equal((await POST(request({ ...payload, email_data: { ...payload.email_data, email_action_type: 'signup' } }))).status, 200)
  assert.equal((await POST(request({ user: { email: 'old@example.com', new_email: 'new@example.com' }, email_data: { email_action_type: 'email_change', token: '111111', token_new: '222222', token_hash_new: 'hash' } }))).status, 200)
  assert.equal(calls.at(-2).to.address, 'old@example.com')
  assert.match(calls.at(-2).text, /111111/)
  assert.equal(calls.at(-1).to.address, 'new@example.com')
  assert.match(calls.at(-1).text, /222222/)
  fail = true
  const failed = await POST(request())
  assert.equal(failed.status, 502)
  assert.doesNotMatch(await failed.text(), /private SMTP/)
  delete process.env.GMAIL_SMTP_APP_PASSWORD
  assert.equal((await POST(request())).status, 503)
})
