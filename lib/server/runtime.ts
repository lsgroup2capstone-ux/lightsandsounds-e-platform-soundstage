import { AsyncLocalStorage } from "node:async_hooks"
import { MemoryStorage } from "../memory-storage"

export const context = new AsyncLocalStorage<{ storage: MemoryStorage; session: MemoryStorage }>()
function current(key: "storage" | "session") {
  const state = context.getStore()
  if (!state) throw new Error("Database operation requires a request context.")
  return state[key]
}
function proxy(key: "storage" | "session"): MemoryStorage {
  return new Proxy(new MemoryStorage(), { get(_target, property) { const object = current(key); const value = Reflect.get(object, property); return typeof value === "function" ? value.bind(object) : value } })
}
export const storage = proxy("storage")
export const session = proxy("session")
export const events = { dispatchEvent(_event: Event) { return true } }
