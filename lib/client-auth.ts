import { appStorage, sessionView, mutate, refreshStore, resetStore } from "./app-store"
import { getSupabase } from "./supabase"
import { normalizePhilippineMobile } from "./phone"
import { getClerkBrowser, signOutClerk } from "./clerk-browser"
import { validatePassword } from "./password-policy"

export async function savePendingAccount(account: ClientAccount, password?: string) {
  if (account.role === "admin") throw new Error("Administrator accounts must be assigned by an administrator.")
  if (account.application) validateProviderDocuments(account.application.documents)
  validatePassword(password ?? "")
  const clerk = await getClerkBrowser()
  if (!clerk.client) throw new Error("Authentication is still loading. Please try again.")
  const email = account.email.trim().toLowerCase()
  sessionStorage.removeItem("soundstage-pending-documents")
  sessionStorage.setItem("soundstage-oauth-role", account.role)
  sessionStorage.setItem("soundstage-signup-email", email)
  sessionStorage.setItem("soundstage-signup-stage", "email")
  sessionStorage.removeItem("soundstage-signup-delivery-error")
  await clerk.client.signUp.create({ emailAddress: email, password, firstName: account.firstName, lastName: account.lastName,
    unsafeMetadata: { mobile: normalizePhilippineMobile(account.mobile), business: account.business || "" } })
  if (account.application) sessionStorage.setItem("soundstage-pending-documents", JSON.stringify({ email, documents: account.application.documents }))
  await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" })
  return false
}
export async function finishSignup() {
  await refreshStore()
  const documents = sessionStorage.getItem("soundstage-pending-documents")
  const pending = documents ? JSON.parse(documents) : null
  if (pending?.email === getAccount()?.email.toLowerCase() && getAccount()?.role === "provider" && !getAccount()?.application) {
    await submitProviderApplication(pending.documents)
    sessionStorage.removeItem("soundstage-pending-documents")
  }
}
export async function verifyPendingAccount(token: string) {
  if (!/^\d{6}$/.test(token)) return false
  const clerk = await getClerkBrowser()
  const signup = clerk.client?.signUp
  if (!signup || !sessionStorage.getItem("soundstage-signup-email")) return false
  const result = await signup.attemptEmailAddressVerification({ code: token })
  if (result.status !== "complete" || !result.createdSessionId) {
    location.assign("/auth/clerk/signup")
    return false
  }
  const { error } = await getSupabase().auth.signOut()
  if (error) throw error
  resetStore()
  await clerk.setActive({ session: result.createdSessionId, navigate: async () => {} })
  if (clerk.session?.currentTask) { location.assign("/auth/clerk/continue"); return false }
  await finishSignup()
  for (const key of ["soundstage-signup-stage", "soundstage-signup-email", "soundstage-signup-phone", "soundstage-oauth-role"]) sessionStorage.removeItem(key)
  return true
}
export async function resendVerification() {
  const clerk = await getClerkBrowser()
  if (!clerk.client?.signUp.id) throw new Error("Start signup again to request a verification email.")
  await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" })
}
export async function loginWithEmailAutomatically(email: string, password: string): Promise<AccountRole | null> {
  email = email.trim().toLowerCase()
  // Local administrator addresses are not public email identifiers accepted by Clerk.
  if (/^[^\s@]+@[^\s@]+\.local$/.test(email)) return (await loginWithAdmin(email, password)).role
  const clerk = await getClerkBrowser()
  if (!clerk.client) throw new Error("Authentication is still loading. Please try again.")
  let legacyRole: AccountRole | null = null
  const result = await clerk.client.signIn.create({ strategy: "password", identifier: email, password }).catch(async (error: unknown) => {
    const errors = (error as { errors?: { code?: string }[] })?.errors
    if (!errors?.some(item => item.code === "form_identifier_not_found" || item.code === "form_password_incorrect")) throw error
    legacyRole = (await loginWithSupabase(email, password)).role
    return null
  })
  if (!result) return legacyRole
  if (result.status !== "complete" || !result.createdSessionId) {
    location.assign("/auth/clerk/continue")
    return null
  }
  const { error } = await getSupabase().auth.signOut()
  if (error) throw error
  resetStore()
  // The system form chooses the destination after loading the account role.
  await clerk.setActive({ session: result.createdSessionId, navigate: async () => {} })
  if (clerk.session?.currentTask) { location.assign("/auth/clerk/continue"); return null }
  await finishSignup()
  return getAccount()?.role ?? null
}
export async function loginWithAdmin(email: string, password: string) {
  return loginWithSupabase(email.trim().toLowerCase(), password, true)
}
async function loginWithSupabase(email: string, password: string, adminOnly = false) {
  await signOutClerk()
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) throw error
  if (adminOnly && data.user?.app_metadata.role !== "admin") {
    await getSupabase().auth.signOut()
    resetStore()
    throw new Error("Administrator access required.")
  }
  resetStore()
  try {
    await refreshStore()
    const account = getAccount()
    if (!account || (adminOnly && account.role !== "admin")) throw new Error("Your account could not be loaded. Please sign in again.")
    return account
  } catch (error) {
    await getSupabase().auth.signOut()
    resetStore()
    throw error
  }
}
export async function requestPasswordReset(email: string) {
  email = email.trim().toLowerCase()
  if (!email) throw new Error("Enter your registered email address.")
  sessionStorage.removeItem("soundstage-reset-attempt")
  const clerk = await getClerkBrowser()
  if (!clerk.client) throw new Error("Authentication is still loading. Please try again.")
  await clerk.client.signIn.create({ strategy: "reset_password_email_code", identifier: email })
  sessionStorage.setItem("soundstage-reset-email", email)
  return true
}
export async function verifyPasswordResetCode(token: string) {
  const email = sessionStorage.getItem("soundstage-reset-email")
  sessionStorage.removeItem("soundstage-reset-attempt")
  if (!email || !/^\d{6}$/.test(token)) return false
  const clerk = await getClerkBrowser()
  const signIn = clerk.client?.signIn
  if (!signIn || signIn.identifier?.toLowerCase() !== email) return false
  const result = await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code: token })
  if (result.status !== "needs_new_password" || !result.id) return false
  sessionStorage.setItem("soundstage-reset-attempt", result.id)
  return true
}
export async function completePasswordReset(password: string) {
  if (password.length < 8) throw new Error("Use at least eight characters for your password.")
  const attempt = sessionStorage.getItem("soundstage-reset-attempt")
  if (!attempt) return false
  const clerk = await getClerkBrowser()
  const signIn = clerk.client?.signIn
  if (!signIn || signIn.id !== attempt || signIn.status !== "needs_new_password" || signIn.identifier?.toLowerCase() !== sessionStorage.getItem("soundstage-reset-email")) return false
  const result = await signIn.resetPassword({ password, signOutOfOtherSessions: true })
  if (result.status !== "complete" && result.status !== "needs_second_factor" && result.status !== "needs_client_trust") throw new Error("Password reset needs additional verification. Continue signing in.")
  // Clear every browser session, including sessions not yet selected as active.
  // Suppress Clerk's default redirect so only the reset form navigates to login.
  await clerk.signOut(() => {})
  clerk.client?.resetSignIn()
  const { error } = await getSupabase().auth.signOut()
  resetStore()
  if (error) throw error
  sessionStorage.removeItem("soundstage-reset-email")
  sessionStorage.removeItem("soundstage-reset-attempt")
  sessionStorage.removeItem("soundstage-login-email")
  sessionStorage.removeItem("soundstage-google-return-to")
  return true
}
export async function loginWithGoogle(role: AccountRole = "client", returnTo?: string) {
  if (role === "admin") throw new Error("Administrator access cannot be requested at signup.")
  sessionStorage.setItem("soundstage-oauth-role", role)
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\")) sessionStorage.setItem("soundstage-google-return-to", returnTo)
  else sessionStorage.removeItem("soundstage-google-return-to")
  const clerk = await getClerkBrowser()
  const { error } = await getSupabase().auth.signOut()
  if (error) throw error
  resetStore()
  if (clerk.session) { location.assign("/auth/clerk/complete"); return }
  if (!clerk.client) throw new Error("Google sign-in is still loading. Please try again.")
  await clerk.client.signIn.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl: "/auth/clerk/callback", redirectUrlComplete: "/auth/clerk/complete" })
}
export async function loginWithGoogleAutomatically(returnTo?: string): Promise<AccountRole> {
  await loginWithGoogle("client", returnTo)
  return "client"
}
export function isLoggedIn() { return getAccount() !== null }
export async function logout() {
  const results = await Promise.allSettled([getSupabase().auth.signOut(), signOutClerk()])
  resetStore()
  for (const result of results) {
    if (result.status === "rejected") throw result.reason
    if (result.value?.error) throw result.value.error
  }
}
export function updateProviderAccount(changes: Partial<Pick<ClientAccount, "firstName" | "lastName" | "email" | "mobile" | "business" | "bio" | "profileImage">>) { return mutate<ClientAccount>("updateProviderAccount", [changes]) }
export function updateClientAccount(changes: Partial<Pick<ClientAccount, "firstName" | "lastName" | "email" | "mobile" | "profileImage">>) { return mutate<ClientAccount>("updateClientAccount", [changes]) }
export function submitProviderApplication(documents: ProviderDocument[]) { return mutate("submitProviderApplication", [documents]) }
export function reviewProviderApplication(email: string, status: "Approved" | "Rejected", reason: string) { return mutate("reviewProviderApplication", [email, status, reason]) }
export type ProviderDocument = { name: string; type: string; data: string }
export type ProviderApplication = { status: "Pending" | "Approved" | "Rejected"; documents: ProviderDocument[]; submittedAt: string; reviewedAt?: string; reason?: string }
export type AccountRole = "client" | "provider" | "admin"
export type ClientAccount = { firstName: string; lastName: string; email: string; mobile: string; role: AccountRole; application?: ProviderApplication; business?: string; bio?: string; profileImage?: string; authMethod: "email" | "phone" | "google" }
const ADMIN_ACCOUNT_KEY = "soundstage-admin-account", SESSION_KEY = "soundstage-session"
const ACCOUNTS_KEY = "soundstage-accounts-v2"
type StoredAccount = ClientAccount & { password?: string }
type AccountSession = { role: AccountRole; email: string }
export function getAccount(): ClientAccount | null { const session = readSession(); if (!session) return null; return session.role === "admin" ? readAdminAccount() : findAccount(session.role, session.email) }
export function getAccountsForAdmin(): ClientAccount[] { if (getAccount()?.role !== "admin") return []; return readAccounts().map(({ password: _password, ...account }) => account) }
function readAccounts(): StoredAccount[] { try { const records = JSON.parse(appStorage.getItem(ACCOUNTS_KEY) || "[]"); return Array.isArray(records) ? records : [] } catch { return [] } }
function findAccount(role: AccountRole, email: string) { return readAccounts().find((account) => account.role === role && account.email.toLowerCase() === email.trim().toLowerCase()) || null }
function readSession(): AccountSession | null { try { return JSON.parse(sessionView.getItem(SESSION_KEY) || "null") as AccountSession | null } catch { return null } }
function readAdminAccount(): StoredAccount | null { try { return JSON.parse(appStorage.getItem(ADMIN_ACCOUNT_KEY) || "null") } catch { return null } }
export function isProviderApproved(email: string) { return findAccount("provider", email)?.application?.status === "Approved" }
export function validateProviderDocuments(documents: ProviderDocument[]) {
  if (!documents.length || documents.length > 4) throw new Error("Upload 1 to 4 documents, including your business permit and valid ID.")
  if (documents.reduce((sum, doc) => sum + doc.data.length, 0) > 1400000) throw new Error("Documents must total 1 MB or less.")
  if (documents.some(doc => !["application/pdf", "image/jpeg", "image/png"].includes(doc.type) || !doc.data.startsWith(`data:${doc.type};base64,`) || !doc.name)) throw new Error("Only PDF, JPG and PNG documents are supported.")
}
export async function readProviderDocuments(files: File[]): Promise<ProviderDocument[]> {
  if (files.reduce((sum, file) => sum + file.size, 0) > 1024 * 1024) throw new Error("Documents must total 1 MB or less.")
  const documents = await Promise.all(files.map(file => new Promise<ProviderDocument>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, type: file.type, data: String(reader.result) }); reader.onerror = () => reject(new Error("Could not read document.")); reader.readAsDataURL(file) })))
  validateProviderDocuments(documents)
  return documents
}
