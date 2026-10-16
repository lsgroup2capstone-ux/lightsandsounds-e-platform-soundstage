const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./ts-loader.cjs')

const { buildServiceRatings, summarize, providerSummary, reviewerName } = createLoader()(path.resolve('lib/service-ratings.ts'))

const booking = (over) => ({ id: 'b', packageId: 's1', client: 'Ana Reyes Cruz', status: 'Completed', feedback: { rating: 5, comment: 'Great', createdAt: '2026-10-01T00:00:00Z' }, ...over })

test('averages and counts per service, ignoring unfinished or invalid feedback', () => {
  const ratings = buildServiceRatings([
    booking(),
    booking({ feedback: { rating: 4, comment: 'Good', createdAt: '2026-10-02T00:00:00Z' } }),
    booking({ status: 'Confirmed' }),
    booking({ feedback: undefined }),
    booking({ feedback: { rating: 6, comment: 'x', createdAt: '' } }),
    booking({ packageId: 's2', feedback: { rating: 3, comment: 'Ok', createdAt: '2026-10-03T00:00:00Z' } }),
  ])
  assert.deepEqual(summarize(ratings.s1), { average: 4.5, count: 2 })
  assert.deepEqual(summarize(ratings.s2), { average: 3, count: 1 })
  assert.deepEqual(summarize([]), { average: 0, count: 0 })
})

test('reviews are newest first', () => {
  const ratings = buildServiceRatings([booking(), booking({ feedback: { rating: 4, comment: 'Later', createdAt: '2026-10-05T00:00:00Z' } })])
  assert.equal(ratings.s1[0].comment, 'Later')
})

test('combines a provider\'s services', () => {
  const ratings = buildServiceRatings([booking(), booking({ packageId: 's2', feedback: { rating: 2, comment: 'Meh', createdAt: '2026-10-03T00:00:00Z' } })])
  assert.deepEqual(providerSummary(['s1', 's2', 's3'], ratings), { average: 3.5, count: 2 })
})

test('public reviews expose only rating, comment, date and first name + initial', () => {
  const [review] = buildServiceRatings([booking({ clientEmail: 'ana@example.com', notes: 'secret' })]).s1
  assert.deepEqual(Object.keys(review).sort(), ['comment', 'createdAt', 'rating', 'reviewer'])
  assert.equal(review.reviewer, 'Ana C.')
  assert.equal(reviewerName('ana@example.com'), 'Client')
  assert.equal(reviewerName(''), 'Client')
  assert.equal(reviewerName('Ana'), 'Ana')
})
