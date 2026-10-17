import { createHmac, timingSafeEqual } from "node:crypto"
import { storage } from "../runtime"
import { getAccount } from "../domain/client-auth"
import { recordMarketplaceAction } from "../domain/marketplace-billing"
import type { ClientAccount } from "../../auth/client-auth"

const accountsKey = "soundstage-accounts-v2"
const adminKey = "soundstage-admin-account"
export type AppBackup = { format: "soundstage-backup"; version: 1; createdAt: string; records: Record<string, string>; signature: string }
function requireAdmin() {
  if (getAccount()?.role !== "admin") throw new Error("Administrator access required.")
}
function signature(payload: Omit<AppBackup, "signature">) {
  const secret = process.env.BACKUP_SIGNING_SECRET || process.env.SUPABASE_DB_URL
  if (!secret) throw new Error("Backup signing is not configured.")
  return createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")
}
function payloadFor(backup: AppBackup): Omit<AppBackup, "signature"> {
  return { format: backup.format, version: backup.version, createdAt: backup.createdAt, records: Object.fromEntries(Object.entries(backup.records).sort(([a], [b]) => a.localeCompare(b))) }
}
export function createBackup(): AppBackup {
  requireAdmin()
  const records = Object.fromEntries(Object.entries(storage.values).filter(([key]) => key !== adminKey))
  // Administrator profiles and all authentication data remain managed separately.
  records[accountsKey] = JSON.stringify((JSON.parse(records[accountsKey] || "[]") as ClientAccount[]).filter(a => a.role !== "admin"))
  const payload = payloadFor({ format: "soundstage-backup", version: 1, createdAt: new Date().toISOString(), records, signature: "" })
  const backup = { ...payload, signature: signature(payload) }
  if (Buffer.byteLength(JSON.stringify({ action: "restoreBackup", args: [backup, "RESTORE"] }), "utf8") > 11000000) throw new Error("App backup exceeds the upload limit. Use an infrastructure database backup for this dataset.")
  return backup
}
export function validateBackup(input: unknown): AppBackup {
  requireAdmin()
  if (!input || typeof input !== "object") throw new Error("Invalid backup file.")
  const backup = input as AppBackup
  if (backup.format !== "soundstage-backup" || backup.version !== 1) throw new Error("Unsupported backup format or version.")
  if (typeof backup.createdAt !== "string" || !Number.isFinite(Date.parse(backup.createdAt)) || !backup.records || typeof backup.records !== "object" || Array.isArray(backup.records)) throw new Error("Invalid backup contents.")
  if (typeof backup.signature !== "string" || !/^[a-f0-9]{64}$/.test(backup.signature)) throw new Error("Backup signature is missing or invalid.")
  if (!timingSafeEqual(Buffer.from(backup.signature, "hex"), Buffer.from(signature(payloadFor(backup)), "hex"))) throw new Error("Backup verification failed. Use an unmodified backup from this system with its original signing key.")
  for (const [key, raw] of Object.entries(backup.records)) {
    if (!key.startsWith("soundstage-") || key === adminKey || typeof raw !== "string") throw new Error("Invalid backup record.")
    JSON.parse(raw)
  }
  const accounts = JSON.parse(backup.records[accountsKey] || "null")
  if (!Array.isArray(accounts) || accounts.some(a => !a || !["client", "provider"].includes(a.role) || typeof a.email !== "string")) throw new Error("Invalid backup accounts.")
  const admins = (JSON.parse(storage.getItem(accountsKey) || "[]") as ClientAccount[]).filter(a => a.role === "admin")
  if (accounts.some(a => admins.some(admin => admin.email.toLowerCase() === a.email.toLowerCase()))) throw new Error("A backup account conflicts with a current administrator.")
  return backup
}
export function previewBackup(input: unknown) {
  const backup = validateBackup(input)
  return { createdAt: backup.createdAt, collections: Object.keys(backup.records).length, accounts: JSON.parse(backup.records[accountsKey]).length }
}
export function restoreBackup(input: unknown, confirmation: unknown) {
  const backup = validateBackup(input)
  if (confirmation !== "RESTORE") throw new Error("Type RESTORE to confirm replacement of current app data.")
  const admins = (JSON.parse(storage.getItem(accountsKey) || "[]") as ClientAccount[]).filter(a => a.role === "admin")
  const adminProfile = storage.getItem(adminKey)
  const accounts = JSON.parse(backup.records[accountsKey])
  storage.clear()
  for (const [key, raw] of Object.entries(backup.records)) storage.setItem(key, raw)
  storage.setItem(accountsKey, JSON.stringify([...accounts, ...admins]))
  if (adminProfile) storage.setItem(adminKey, adminProfile)
  recordMarketplaceAction("App backup restored", backup.createdAt, "Current app data", "Backup data")
  return { collections: Object.keys(backup.records).length }
}
