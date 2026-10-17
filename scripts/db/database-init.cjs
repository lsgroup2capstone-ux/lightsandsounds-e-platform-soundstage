require('@next/env').loadEnvConfig(process.cwd())
const fs = require('node:fs/promises')
const postgres = require('postgres')
const { databaseConfig } = require('./database-config.cjs')
;(async () => {
  const { url, options } = databaseConfig()
  const sql = postgres(url, options)
  try {
    const schema = await fs.readFile('database/schema.sql', 'utf8')
    // The schema contains BEGIN/COMMIT, so pin it to one pooled connection.
    const connection = await sql.reserve()
    try {
      await connection.unsafe(schema)
      console.log('Supabase PostgreSQL schema applied successfully.')
    } finally { connection.release() }
  }
  finally { await sql.end() }
})().catch(error => { console.error('Database initialization failed:', error.code === 'DATABASE_NOT_CONFIGURED' ? error.message : error.code || error.message); process.exitCode = 1 })
