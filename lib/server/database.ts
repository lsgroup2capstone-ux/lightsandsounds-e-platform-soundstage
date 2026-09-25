import "server-only"
import postgres from "postgres"
import { createHash } from "node:crypto"
import { databaseConfig } from "../../scripts/database-config.cjs"
const state = globalThis as typeof globalThis & { soundstagePostgres?: ReturnType<typeof postgres>; soundstagePostgresConfig?: string }
export function getDatabase() {
  const { url, options } = databaseConfig()
  const config = createHash("sha256").update(JSON.stringify({ url, options })).digest("hex")
  if (!state.soundstagePostgres || state.soundstagePostgresConfig !== config) {
    const previous = state.soundstagePostgres
    state.soundstagePostgres = postgres(url, options)
    state.soundstagePostgresConfig = config
    if (previous) void previous.end({ timeout: 5 }).catch(() => {})
  }
  return state.soundstagePostgres
}
