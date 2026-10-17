const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const { verifyWebhook, createCheckout, paymentKey } = require('../helpers/ts-loader.cjs')()('lib/server/payments/paymongo.ts')
test('PayMongo requires server credentials and signs the raw webhook body with the correct mode', () => {
  delete process.env.PAYMONGO_SECRET_KEY
  assert.throws(paymentKey, /Configure/)
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture'
  process.env.PAYMONGO_WEBHOOK_SECRET = 'whsec_fixture'
  const body = '{"data":{}}'
  const t = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', 'whsec_fixture').update(`${t}.${body}`).digest('hex')
  assert.equal(verifyWebhook(body, `t=${t},te=${signature},li=`), true)
  assert.equal(verifyWebhook(body + ' ', `t=${t},te=${signature}`), false)
  assert.equal(verifyWebhook(body, `t=${t},li=${signature}`), false)
  assert.equal(verifyWebhook(body, `t=${t - 1000},te=${signature}`), false)
  assert.equal(verifyWebhook(body, null), false)
})
test('Checkout sends centavos and server redirects without exposing the secret key', async () => {
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture'
  process.env.APP_URL = 'https://soundstage.example'
  const original = global.fetch
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.paymongo.com/v1/checkout_sessions')
    const a = JSON.parse(options.body).data.attributes
    assert.equal(a.line_items[0].amount, 49900)
    assert.equal(a.line_items[0].currency, 'PHP')
    assert.deepEqual(a.payment_method_types, ['paymaya'])
    assert.equal(a.success_url, 'https://soundstage.example/payment/return?id=test-id')
    return { ok: true, json: async () => ({ data: { id: 'cs_test', attributes: { checkout_url: 'https://checkout.paymongo.com/test' } } }) }
  }
  try {
    await createCheckout('test-id', 'Starter', 499, 'Maya')
    await assert.rejects(createCheckout('test-id', 'Starter', 499, 'invalid'), /Select/)
    global.fetch = async () => ({ ok: false })
    await assert.rejects(createCheckout('test-id', 'Starter', 499, 'GCash'), /could not process/)
  } finally { global.fetch = original }
})
