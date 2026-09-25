import { getSupabase } from "./supabase"
import { MemoryStorage } from "./memory-storage"

export const appStorage = new MemoryStorage()
export const sessionView = new MemoryStorage()
const events = ["account", "services", "bookings", "marketplace", "messages", "reports", "withdrawals"]
let generation = 0
let queue: Promise<unknown> = Promise.resolve()
let pendingRefresh: { generation: number; promise: Promise<void> } | undefined
function apply(payload: { records: Record<string, string>; session: Record<string, string> }) {
  if (JSON.stringify(appStorage.values) === JSON.stringify(payload.records) && JSON.stringify(sessionView.values) === JSON.stringify(payload.session)) return
  appStorage.values = payload.records
  sessionView.values = payload.session
  if (typeof window !== "undefined") for (const name of events) window.dispatchEvent(new Event(`soundstage-${name}-updated`))
}
async function request(action?: string, args: unknown[] = []) {
  const { data: { session }, error } = await getSupabase().auth.getSession()
  if (error) throw error
  const clerkToken = !session && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? await (await import("@clerk/nextjs")).getToken() : null
  const response = await fetch("/api/data", {
    method: action ? "POST" : "GET", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Signup-Role": sessionStorage.getItem("soundstage-oauth-role") || "", ...(session ? { Authorization: `Bearer ${session.access_token}` } : clerkToken ? { Authorization: `Bearer ${clerkToken}`, "X-Auth-Provider": "clerk" } : {}) },
    ...(action ? { body: JSON.stringify({ action, args }) } : {}),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || "Could not save changes.")
  return payload
}
export function refreshStore(): Promise<void> {
  const current = generation
  // Share a refresh only when no write has been queued after it. A refresh
  // following a mutation must still fetch that mutation's resulting state.
  if (pendingRefresh?.generation === current && queue === pendingRefresh.promise) return pendingRefresh.promise
  const run = queue.catch(() => {}).then(async () => {
    if (current !== generation) return
    const payload = await request()
    if (current === generation) apply(payload)
  })
  queue = run
  pendingRefresh = { generation: current, promise: run }
  const clearPending = () => { if (pendingRefresh?.promise === run) pendingRefresh = undefined }
  void run.then(clearPending, clearPending)
  return run
}
export function resetStore() { generation++; pendingRefresh = undefined; apply({ records: {}, session: {} }) }
export function mutate<T = void>(action: string, args: unknown[] = []): Promise<T> {
  const current = generation
  const run = queue.catch(() => {}).then(async () => {
    if (current !== generation) throw new Error("Your session changed. Please try again.")
    const payload = await request(action, args)
    if (current === generation) apply(payload)
    return payload.result as T
  })
  queue = run
  void run.catch(error => window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error.message })))
  return run
}
