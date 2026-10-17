import { AsyncLocalStorage } from "node:async_hooks"
import { MemoryStorage } from "../data/memory-storage"

export const context = new AsyncLocalStorage<{ storage: MemoryStorage; session: MemoryStorage; pendingDeletes?: string[] }>()
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
// R2 objects are removed only after the request's transaction commits.
export function queueDelete(key: string) {
  const state = context.getStore()
  if (!state) throw new Error("Database operation requires a request context.")
  if (!state.pendingDeletes) state.pendingDeletes = []
  if (key && !state.pendingDeletes.includes(key)) state.pendingDeletes.push(key)
}
