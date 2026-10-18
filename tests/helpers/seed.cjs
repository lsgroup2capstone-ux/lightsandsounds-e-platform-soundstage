// Seeds users and service packages into the 11 core tables and returns their ids by email or package key.
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist')

async function openDatabase() {
  const db = new PGlite({ extensions: { btree_gist } })
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('database/schema.sql', 'utf8'))
  return db
}

// users: [{ email, role, status?: 'approved'|'pending', business?, first?, last?, clerk? }]
// packages: [{ key, provider, name?, price?, active?, location?, coverage? }]
async function seed(db, { users = [], packages = [] }) {
  const ids = {}
  for (const u of users) {
    const [row] = (await db.query(`INSERT INTO soundstage.users (clerk_user_id, email, role, first_name, last_name, business_name, verification_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id`, [u.clerk || null, u.email, u.role, u.first ?? u.role, u.last ?? 'Test', u.business || null,
      u.role === 'provider' ? (u.status || 'approved') : null])).rows
    ids[u.email] = String(row.user_id)
  }
  for (const p of packages) {
    const [row] = (await db.query(`INSERT INTO soundstage.service_packages (provider_id, name, price, location, coverage_areas, is_active, inclusions)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING package_id`, [ids[p.provider], p.name || 'Pro Sound ' + p.key, p.price ?? 10000, p.location || 'Manila', p.coverage || p.location || 'Manila',
      p.active !== false, 'Speakers, Mixer'])).rows
    ids[p.key] = String(row.package_id)
  }
  return ids
}

// A booking inserted directly (for states the API would not create on its own).
async function insertBooking(db, ids, { client, provider, pkg, date, days = 1, status = 'pending', total = 10000 }) {
  const [row] = (await db.query(`INSERT INTO soundstage.bookings (client_id, provider_id, package_id, event_date, duration_days, package_name, package_price, total_amount, status)
    VALUES ($1, $2, $3, $4, $5, 'Pkg', $6, $6, $7) RETURNING booking_id`, [ids[client], ids[provider], ids[pkg], date, days, total, status])).rows
  return String(row.booking_id)
}

module.exports = { openDatabase, seed, insertBooking }
