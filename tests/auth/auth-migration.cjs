const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validateSource } = require('../../scripts/auth/migrate-clerk-to-supabase.cjs')
test('migration requires verified matching Clerk ownership and preserves existing roles', () => {
  const mapping = { clerk_id: 'user_1', email: 'user@example.com', role: 'provider' }
  const source = { id: 'user_1', primaryEmailAddressId: 'email_1', emailAddresses: [{ id: 'email_1', emailAddress: mapping.email, verification: { status: 'verified' } }] }
  const profile = { role: 'provider' }
  const existing = { id: 'uuid-1', email_confirmed_at: '2026-01-01', app_metadata: {} }
  assert.doesNotThrow(() => validateSource(mapping, source, profile))
  assert.doesNotThrow(() => validateSource(mapping, source, profile, existing, { auth_id: existing.id, role: 'provider' }))
  for (const change of [{ banned: true }, { locked: true }, { id: 'user_other' }, { primaryEmailAddressId: 'unknown' }]) {
    assert.throws(() => validateSource(mapping, { ...source, ...change }, profile), /inactive, unverified, or changed/)
  }
  assert.throws(() => validateSource(mapping, source, { role: 'client' }), /role mismatch/)
  assert.throws(() => validateSource(mapping, source, profile, { ...existing, email_confirmed_at: null }), /needs review/)
  assert.throws(() => validateSource(mapping, source, profile, { ...existing, app_metadata: { role: 'admin' } }), /needs review/)
  assert.throws(() => validateSource(mapping, source, profile, existing, { auth_id: 'different', role: 'provider' }), /conflicts/)
})
