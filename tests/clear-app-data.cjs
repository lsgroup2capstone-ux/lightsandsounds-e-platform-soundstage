const { test } = require('node:test')
const assert = require('node:assert/strict')
const { clearAppData } = require('./ts-loader.cjs')()('lib/clear-app-data.ts')
test('legacy browser reset cannot erase shared cloud data', async () => {
  await assert.rejects(clearAppData(), /Cloud data cannot be erased/)
})
