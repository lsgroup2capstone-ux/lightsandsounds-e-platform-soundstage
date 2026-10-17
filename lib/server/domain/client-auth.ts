import { storage, session, events } from "../runtime"
import { isOwnKey } from "../storage/file-keys"
import { ensureProviderTrial, migrateProviderBilling, recordAdminAction, recordMarketplaceAction } from "./marketplace-billing"
export type ProviderDocument = { name: string; type: string; key: string; size: number }
export type ProviderApplication = { status: "Pending" | "Approved" | "Rejected"; documents: ProviderDocument[]; submittedAt: string; reviewedAt?: string; reason?: string }
export type AccountRole = "client" | "provider" | "payroll_master" | "admin"
export type ClientAccount = { firstName: string; lastName: string; email: string; mobile: string; role: AccountRole; application?: ProviderApplication; business?: string; bio?: string; profileImage?: string; authMethod: "email" | "phone" | "google" }
const ADMIN_ACCOUNT_KEY = "soundstage-admin-account", SESSION_KEY = "soundstage-session"
const ACCOUNTS_KEY = "soundstage-accounts-v2"
type StoredAccount = ClientAccount & { password?: string }
type AccountSession = { role: AccountRole; email: string }

export function getAccount(): ClientAccount | null { const session = readSession(); if (!session) return null; return session.role === "admin" ? readAdminAccount() : findAccount(session.role, session.email) }
export function getAccountsForAdmin(): ClientAccount[] { if (getAccount()?.role !== "admin") return []; return readAccounts().map(({ password: _password, ...account }) => account) }
export function updateProviderAccount(changes: Partial<Pick<ClientAccount, "firstName" | "lastName" | "email" | "mobile" | "business" | "bio" | "profileImage">>) { const account = getAccount(); if (!account || account.role !== "provider") return null; const updated = { ...account, ...changes, role: "provider" as const }; replaceAccount(account, updated); recordMarketplaceAction("Provider profile updated", updated.email, "Previous profile", "Profile saved"); migrateProviderBilling(account.email, updated.email); setSession(updated); events.dispatchEvent(new CustomEvent("soundstage-account-updated", { detail: updated })); return updated }
export function updateClientAccount(changes: Partial<Pick<ClientAccount, "firstName" | "lastName" | "email" | "mobile" | "profileImage">>) { const account = getAccount(); if (!account || account.role !== "client") return null; const updated = { ...account, ...changes, role: "client" as const }; replaceAccount(account, updated); setSession(updated); recordMarketplaceAction("Client profile updated", updated.email, "Previous profile", "Profile saved"); events.dispatchEvent(new Event("soundstage-account-updated")); return updated }
function readAccounts(): StoredAccount[] { try { const records = JSON.parse(storage.getItem(ACCOUNTS_KEY) || "[]"); return Array.isArray(records) ? records : [] } catch { return [] } }
function saveAccount(account: StoredAccount) { const accounts = readAccounts(); const index = accounts.findIndex((item) => item.role === account.role && item.email.toLowerCase() === account.email.toLowerCase()); if (index >= 0) accounts[index] = account; else accounts.push(account); storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)) }
function replaceAccount(previous: StoredAccount, updated: StoredAccount) { const accounts = readAccounts().filter((item) => !(item.role === previous.role && item.email.toLowerCase() === previous.email.toLowerCase())); accounts.push(updated); storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)); if (previous.email.toLowerCase() !== updated.email.toLowerCase()) { const prefix = previous.role === "client" ? "soundstage-client-bookings-v3:" : "soundstage-provider-services-v2:"; const oldKey = `${prefix}${encodeURIComponent(previous.email.trim().toLowerCase())}`; const newKey = `${prefix}${encodeURIComponent(updated.email.trim().toLowerCase())}`; const data = storage.getItem(oldKey); if (data && !storage.getItem(newKey)) storage.setItem(newKey, data); storage.removeItem(oldKey) } }
function findAccount(role: AccountRole, email: string) { return readAccounts().find((account) => account.role === role && account.email.toLowerCase() === email.trim().toLowerCase()) || null }
function setSession(account: Pick<ClientAccount, "role" | "email">) { if (account.role === "provider" && findAccount("provider", account.email)?.application?.status === "Approved") ensureProviderTrial(account.email); session.setItem(SESSION_KEY, JSON.stringify({ role: account.role, email: account.email } satisfies AccountSession)) }
function readSession(): AccountSession | null { try { return JSON.parse(session.getItem(SESSION_KEY) || "null") as AccountSession | null } catch { return null } }
function readAdminAccount(): StoredAccount | null { try { return JSON.parse(storage.getItem(ADMIN_ACCOUNT_KEY) || "null") } catch { return null } }
export function isProviderApproved(email: string) { return findAccount("provider", email)?.application?.status === "Approved" }
export function validateProviderDocuments(documents: ProviderDocument[], ownerEmail: string) {
  if (!Array.isArray(documents) || !documents.length || documents.length > 4) throw new Error("Upload 1 to 4 documents, including your business permit and valid ID.")
  if (documents.some(doc => !doc || typeof doc.name !== "string" || !doc.name.trim() || doc.name.length > 200 || !["application/pdf", "image/jpeg", "image/png"].includes(doc.type) || !Number.isInteger(doc.size) || doc.size < 1 || doc.size > 5 * 1024 * 1024 || Object.hasOwn(doc, "data") || !isOwnKey("provider-document", ownerEmail, doc.key))) throw new Error("Upload PDF, JPG or PNG documents of up to 5 MB each.")
}
export function submitProviderApplication(documents: ProviderDocument[]) {
  const account = getAccount()
  if (account?.role !== "provider") throw new Error("Provider access required.")
  if (account.application && account.application.status !== "Rejected") throw new Error("Your application has already been submitted.")
  validateProviderDocuments(documents, account.email)
  saveAccount({ ...account, application: { status: "Pending", documents: documents.map(({ name, type, key, size }) => ({ name, type, key, size })), submittedAt: new Date().toISOString() } })
  recordMarketplaceAction("Provider application submitted", account.email, account.application?.status || "Not submitted", "Pending")
  events.dispatchEvent(new Event("soundstage-account-updated"))
}
export function reviewProviderApplication(email: string, status: "Approved" | "Rejected", reason: string) {
  if (getAccount()?.role !== "admin") throw new Error("Administrator access required.")
  const account = findAccount("provider", email)
  if (!account?.application || account.application.status !== "Pending") throw new Error("This application is no longer pending.")
  if (!["Approved", "Rejected"].includes(status)) throw new Error("Invalid decision.")
  if (status === "Rejected" && reason.trim().length < 3) throw new Error("Give a reason for rejection.")
  validateProviderDocuments(account.application.documents, account.email)
  saveAccount({ ...account, application: { ...account.application, status, reason: reason.trim(), reviewedAt: new Date().toISOString() } })
  if (status === "Approved") ensureProviderTrial(email)
  recordAdminAction("Provider application reviewed", email, "Pending", `${status}${reason.trim() ? ": " + reason.trim() : ""}`)
  events.dispatchEvent(new Event("soundstage-account-updated"))
  events.dispatchEvent(new Event("soundstage-services-updated"))
}
