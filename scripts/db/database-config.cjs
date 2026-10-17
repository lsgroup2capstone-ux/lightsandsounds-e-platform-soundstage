function databaseConfig(env = process.env) {
  const url = env.SUPABASE_DB_URL
  if (!url?.trim()) throw Object.assign(new Error('Set SUPABASE_DB_URL in .env.local using Supabase Connect > Session pooler.'), { code: 'DATABASE_NOT_CONFIGURED' })
  let parsed
  try { parsed = new URL(url) } catch { throw new Error('SUPABASE_DB_URL must be a PostgreSQL connection URL.') }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.password) throw new Error('SUPABASE_DB_URL must include a PostgreSQL host, user, and password.')
  for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(key)
  return { url: parsed.toString(), options: { ssl: { rejectUnauthorized: true, ...(env.SUPABASE_DB_CA ? { ca: env.SUPABASE_DB_CA.replace(/\\n/g, '\n') } : {}) }, prepare: false, max: 5, connect_timeout: 10, idle_timeout: 20 } }
}
module.exports = { databaseConfig }
