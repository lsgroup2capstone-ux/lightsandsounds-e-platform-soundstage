const { test } = require('node:test')
const assert = require('node:assert/strict')
const { clearAppData } = require('../helpers/ts-loader.cjs')()('lib/data/clear-app-data.ts')
test('legacy browser reset cannot erase shared cloud data', async () => {
  await assert.rejects(clearAppData(), /Cloud data cannot be erased/)
})
