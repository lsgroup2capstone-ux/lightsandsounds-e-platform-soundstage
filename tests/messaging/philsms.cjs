const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Webhook } = require('standardwebhooks')
const createLoader = require('../helpers/ts-loader.cjs')
const { normalizePhilippineMobile } = createLoader()('lib/auth/phone.ts')

test('Philippine phone normalization rejects other countries and multiple recipients', () => {
  for (const input of ['09171234567', '639171234567', '+63 (917) 123-4567']) assert.equal(normalizePhilippineMobile(input), '+639171234567')
  for (const input of ['123', '+14155552671', '09171234567,09171234568', '0917abc1234567']) assert.throws(() => normalizePhilippineMobile(input))
})

test('SMS hook validates signatures and payloads before delivery and handles provider failures', async () => {
  const { POST } = createLoader()('app/api/auth/send-sms/route.ts')
  const originalFetch = global.fetch
  const keys = ['SUPABASE_SEND_SMS_HOOK_SECRET', 'PHILSMS_API_TOKEN', 'PHILSMS_SENDER_ID']
  const previous = keys.map(key => process.env[key])
  const secret = Buffer.alloc(32, 7).toString('base64')
  const hook = new Webhook(secret)
  process.env.SUPABASE_SEND_SMS_HOOK_SECRET = `v1,whsec_${secret}`
  process.env.PHILSMS_API_TOKEN = 'test-token'
  process.env.PHILSMS_SENDER_ID = 'SoundStage'
  const payload = { user: { phone: '+639171234567' }, sms: { otp: '123456' } }
  let calls = []
  global.fetch = async (url, options) => { calls.push({ url, ...options }); return Response.json({ status: 'success' }) }
  const request = (event = payload, timestamp = new Date(), invalid = false) => {
    const body = JSON.stringify(event)
    return new Request('https://example.test/api/auth/send-sms', { method: 'POST', body, headers: {
      'webhook-id': 'test-event', 'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': invalid ? 'v1,invalid' : hook.sign('test-event', timestamp, body),
    } })
  }
  try {
    assert.equal((await POST(request(payload, new Date(), true))).status, 401)
    assert.equal((await POST(request(payload, new Date(Date.now() - 600000)))).status, 401)
    assert.equal((await POST(request({ user: { phone: '123' }, sms: { otp: '123456' } }))).status, 400)
    assert.equal((await POST(request({ user: payload.user, sms: { otp: '12345' } }))).status, 400)
    assert.equal((await POST(request({ user: payload.user, sms: { otp: '1234567' } }))).status, 400)
    assert.equal((await POST(request({ user: payload.user, sms: { otp: 123456 } }))).status, 400)
    assert.equal((await POST(request({ user: payload.user, sms: { otp: '123456' }, padding: 'a'.repeat(65536) }))).status, 413)
    assert.equal(calls.length, 0)
    assert.equal((await POST(request())).status, 200)
    assert.equal(calls[0].url, 'https://dashboard.philsms.com/api/v3/sms/send')
    assert.equal(calls[0].headers.Authorization, 'Bearer test-token')
    assert.deepEqual(JSON.parse(calls[0].body), { recipient: '639171234567', sender_id: 'SoundStage', type: 'plain', message: 'Your SoundStage verification code is 123456. Do not share this code.' })
    global.fetch = async () => Response.json({ status: 'error', message: 'private provider details' })
    const failed = await POST(request())
    assert.equal(failed.status, 502)
    assert.equal((await failed.text()).includes('private provider details'), false)
    global.fetch = async () => new Response('private upstream failure', { status: 502 })
    assert.equal((await POST(request())).status, 502)
    global.fetch = async () => Response.json({ status: 'success' }, { status: 403 })
    assert.equal((await POST(request())).status, 502)
    global.fetch = async () => { throw new Error('timeout') }
    assert.equal((await POST(request())).status, 502)
    delete process.env.PHILSMS_API_TOKEN
    assert.equal((await POST(request())).status, 503)
  } finally {
    global.fetch = originalFetch
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i] })
  }
})
