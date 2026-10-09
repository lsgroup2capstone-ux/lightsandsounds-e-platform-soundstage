const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createCheckout } = require('./ts-loader.cjs')()('lib/server/paymongo.ts')
test('GCash and Maya QR checkouts use QR Ph; wallet and card routes remain distinct', async () => {
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture'
  const original = global.fetch
  try {
    for (const [method, channel] of [['GCash QR', 'qrph'], ['Maya QR', 'qrph'], ['GCash', 'gcash'], ['Maya', 'paymaya'], ['Credit / Debit card', 'card']]) {
      global.fetch = async (_url, options) => {
        const attributes = JSON.parse(options.body).data.attributes
        assert.deepEqual(attributes.payment_method_types, [channel])
        assert.equal(attributes.line_items[0].amount, 150000)
        return { ok: true, json: async () => ({ data: { id: 'cs_fixture', attributes: { checkout_url: 'https://checkout.paymongo.com/fixture' } } }) }
      }
      await createCheckout('booking-id', 'Deposit', 1500, method)
    }
  } finally { global.fetch = original }
})
