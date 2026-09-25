import { storage } from "./runtime"
import { getAccount } from "./domain/client-auth"
import type { ClientAccount } from "../client-auth"

const accountsKey = "soundstage-accounts-v2"
const keys = new Set([accountsKey, "soundstage-marketplace-v1", "soundstage-booking-messages-v1", "soundstage-provider-reports-v1", "soundstage-withdrawals-v1"])
export function importLegacyRecords(input: unknown) {
  if (getAccount()?.role !== "admin") throw new Error("Administrator access required.")
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid browser export.")
  const existing = JSON.parse(storage.getItem(accountsKey) || "[]") as ClientAccount[]
  if (existing.some(a => a.role !== "admin") || Object.keys(storage.values).some(k => k !== accountsKey && k !== "soundstage-admin-account")) throw new Error("Import requires an empty app database. Export and review existing cloud records before merging data.")
  const entries: [string, string][] = []
  let accounts: ClientAccount[] = []
  for (const [key, raw] of Object.entries(input)) {
    if (!keys.has(key) && !key.startsWith("soundstage-client-bookings-v3:") && !key.startsWith("soundstage-provider-services-v2:")) throw new Error("Export contains an unsupported record type.")
    if (typeof raw !== "string") throw new Error("Invalid browser record.")
    // Old browser accounts used plaintext passwords; they must never enter PostgreSQL.
    const value = JSON.parse(raw, (name, value) => /password|token|secret/i.test(name) ? undefined : value)
    if (key === accountsKey) {
      if (!Array.isArray(value)) throw new Error("Invalid accounts export.")
      accounts = value.filter((a: ClientAccount) => a.role !== "admin")
      const seen = new Set<string>()
      for (const a of accounts) {
        if (!["client", "provider"].includes(a.role) || typeof a.email !== "string" || !a.email.includes("@")) throw new Error("Invalid imported account.")
        a.email = a.email.trim().toLowerCase()
        if (seen.has(a.email) || existing.some(e => e.email.toLowerCase() === a.email)) throw new Error("Supabase uses one identity per email. Resolve duplicate account emails before importing.")
        seen.add(a.email)
      }
      continue
    }
    if (key === "soundstage-marketplace-v1") {
      if (!Array.isArray(value.subscriptions) || !Array.isArray(value.payments) || !Array.isArray(value.audit)) throw new Error("Invalid billing export.")
    } else if (!Array.isArray(value)) throw new Error("Invalid collection export.")
    if (key.startsWith("soundstage-client-bookings-v3:")) for (const booking of value) {
      if (!booking.id || !booking.packageId || !booking.provider || !booking.date) throw new Error("Invalid booking export.")
      if (booking.paid) booking.paymentMethod = `DEMO: imported ${booking.paymentMethod || "payment"}`
    }
    entries.push([key, JSON.stringify(value)])
  }
  if (!accounts.length && !entries.length) throw new Error("No browser records were found.")
  const known = new Set(accounts.map(a => a.email))
  for (const [key] of entries) if (key.startsWith("soundstage-client-bookings-v3:") || key.startsWith("soundstage-provider-services-v2:")) {
    if (!known.has(decodeURIComponent(key.slice(key.indexOf(":") + 1)))) throw new Error("A collection has no matching imported account.")
  }
  storage.setItem(accountsKey, JSON.stringify([...existing, ...accounts]))
  for (const [key, raw] of entries) storage.setItem(key, raw)
  storage.setItem("soundstage-import-completed", JSON.stringify({ at: new Date().toISOString(), accounts: accounts.length, collections: entries.length }))
  return { accounts: accounts.length, collections: entries.length }
}
