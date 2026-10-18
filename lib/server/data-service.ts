import { paymentKey } from "./payments/paymongo"
import * as checkout from "./payments/checkout"
import { createClient } from "@supabase/supabase-js"
import type { AppIdentity } from "./auth/clerk-auth"
import { getDatabase } from "./db/database"
import { MemoryStorage } from "../data/memory-storage"
import { context, storage, session, queueDelete, type Tx } from "./runtime"
import * as auth from "./domain/client-auth"
import * as bookings from "./domain/client-bookings"
import * as bookingCore from "./bookings/core"
import * as bookingRequests from "./bookings/requests"
import * as availability from "./bookings/availability"
import * as bookingView from "./bookings/compat"
import { currentTx } from "./runtime"
import * as services from "./domain/provider-services"
import * as billing from "./domain/marketplace-billing"
import * as communications from "./domain/communications"
import * as withdrawals from "./domain/withdrawals"
import type { ClientAccount } from "../auth/client-auth"
import type { Booking } from "../marketplace/mock-data"
import { isAreaCovered, getTownDistance, getTransportationFee } from "../booking/booking-pricing"
import { importLegacyRecords } from "./db/legacy-import"
import { createBackup, previewBackup, restoreBackup } from "./db/backup"
import { RequestError } from "./request-error"
import "./payments/ledger"
import { KIND_RULES, buildKey, isDataUrl, isFileKind, isOwnKey, type FileKind } from "./storage/file-keys"
import { deleteObject, headObject, presignGet, presignPut, publicBaseUrl } from "./storage/r2"
import { ensureProfile } from "./auth/profiles"
import { assertProviderActionAllowed } from "./auth/provider-lock"
import { SERVICE_RATINGS_KEY, buildServiceRatings } from "../marketplace/service-ratings"

export { RequestError }
const accountsKey = "soundstage-accounts-v2"
const bookingPrefix = "soundstage-client-bookings-v3:"
const servicePrefix = "soundstage-provider-services-v2:"
const billingKey = "soundstage-marketplace-v1"
const keyFor = (prefix: string, email: string) => prefix + encodeURIComponent(email.trim().toLowerCase())
const allAccounts = () => JSON.parse(storage.getItem(accountsKey) || "[]") as ClientAccount[]
const fullName = (a: ClientAccount) => `${a.firstName} ${a.lastName}`
const providerName = (a: ClientAccount) => a.business || fullName(a)
const requireRole = (...roles: string[]) => {
  const a = auth.getAccount()
  if (!a || !roles.includes(a.role)) throw new RequestError("You do not have permission for this operation.", 403)
  return a
}
function text(value: unknown, max = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new RequestError("A required text field is invalid.")
  return value.trim()
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Invalid input.")
  return value as Record<string, unknown>
}
function finite(value: unknown, min = 0, max = 10000000) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new RequestError("Invalid amount or quantity.")
  return value
}
// Table-backed ownership: missing and not-owned look the same (booking AC13).
async function ownBooking(id: unknown, role?: "client" | "provider") {
  const actor = requireRole(role || "client", ...(role ? [] : ["provider", "admin"]))
  return bookingView.getOwned(payer(actor), id)
}
// An unchanged value skips the HEAD so legacy base64 stays saveable until migration.
async function verifiedKey(kind: FileKind, email: string, value: unknown, previous?: string) {
  const key = String(value || "")
  if (!key) return ""
  if (key === previous) return key
  if (isDataUrl(key) || !isOwnKey(kind, email, key)) throw new RequestError("Upload the file again.")
  const head = await headObject(key)
  if (!head || head.size > KIND_RULES[kind].maxBytes || !KIND_RULES[kind].types.includes(head.type)) throw new RequestError("The upload did not finish. Please try again.")
  return key
}
const serviceCategories = ["Sound System", "Lighting", "Full Production", "Band & Stage"]
async function serviceInput(value: unknown, previous: { id: string; image: string }[] = []) {
  const a = requireRole("provider")
  const v = record(value)
  const id = text(v.id, 100)
  if (Object.entries(storage.values).some(([k, raw]) => k.startsWith(servicePrefix) && k !== keyFor(servicePrefix, a.email) && JSON.parse(raw).some((s: { id: string }) => s.id === id))) throw new RequestError("Service ID already exists.")
  return { id, name: text(v.name, 200), location: text(v.location, 200), coverageAreas: text(v.coverageAreas || v.location, 2000), transportationFee: finite(v.transportationFee || 0), description: String(v.description || "").slice(0, 5000), price: finite(v.price, 1), image: await verifiedKey("service-image", a.email, v.image, previous.find(s => s.id === id)?.image), providerName: providerName(a), active: v.active === true, bookings: 0, category: serviceCategories.includes(String(v.category)) ? v.category as services.ProviderService["category"] : "Full Production" }
}
async function updateProfile(value: unknown, role: "client" | "provider") {
  const actor = requireRole(role)
  const input = record(value)
  if (input.email && String(input.email).toLowerCase() !== actor.email.toLowerCase()) throw new RequestError("Email changes require verification through Supabase Auth; contact support.")
  const changes: Record<string, string> = {}
  for (const key of ["firstName", "lastName", "mobile", "business", "bio", "profileImage"]) if (key in input && (role === "provider" || !["business", "bio"].includes(key))) changes[key] = String(input[key] || "").slice(0, 2000)
  if ("profileImage" in input) changes.profileImage = await verifiedKey("profile-image", actor.email, input.profileImage, actor.profileImage)
  if (changes.business && changes.business !== actor.business) {
    if (allAccounts().some(a => a.email !== actor.email && a.role === "provider" && providerName(a) === changes.business)) throw new RequestError("That business name is already registered.")
  }
  const result = role === "provider" ? auth.updateProviderAccount(changes) : auth.updateClientAccount(changes)
  if (role === "provider" && result) {
    const ownKey = keyFor(servicePrefix, actor.email)
    const own = JSON.parse(storage.getItem(ownKey) || "[]")
    storage.setItem(ownKey, JSON.stringify(own.map((s: object) => ({ ...s, providerName: providerName(result) }))))
  }
  if (result && actor.profileImage !== result.profileImage && isOwnKey("profile-image", actor.email, actor.profileImage)) queueDelete(actor.profileImage!)
  return result
}

// Called only by the verified webhook (payments AC19).
export function activateSubscription(payment: { id: string; email: string; plan?: string | null; amount: number; method: string; reference: string }) {
  const at = new Date().toISOString()
  const state = JSON.parse(storage.getItem(billingKey) || '{"subscriptions":[],"payments":[],"audit":[]}')
  const subscription = state.subscriptions.find((s: billing.Subscription) => s.email === payment.email)
  if (!subscription) throw new RequestError("Subscription not found.")
  subscription.plan = payment.plan
  subscription.paidUntil = new Date(Math.max(Date.now(), Date.parse(subscription.paidUntil || subscription.trialEnd)) + 30 * 86400000).toISOString()
  state.payments.unshift({ id: payment.id, email: payment.email, customer: payment.email, plan: payment.plan, amount: payment.amount, method: payment.method, reference: payment.reference, status: "Paid", createdAt: at, paidAt: at, invoice: `SI-${payment.id}` })
  storage.setItem(billingKey, JSON.stringify(state))
}
const payer = (a: ClientAccount) => ({ id: a.email, email: a.email, role: a.role as "client" | "provider" | "admin" | "payroll_master" })

// This allowlist is the only browser-accessible write surface. Domain helpers are not RPCs.
export const actions: Record<string, (...args: any[]) => unknown> = {
  createBackup,
  previewBackup,
  restoreBackup,
  importLegacyRecords,
  setNotificationReads: ids => {
    const actor = requireRole("client", "provider", "admin")
    if (!Array.isArray(ids) || ids.length > 10000 || ids.some(id => typeof id !== "string")) throw new RequestError("Invalid notifications.")
    storage.setItem(`soundstage-event-notifications:${actor.role}:${actor.email.toLowerCase()}`, JSON.stringify(ids))
  },
  getBookingAvailability: async packageId => {
    const serviceId = text(packageId, 100)
    const owner = Object.entries(storage.values).find(([key, raw]) => key.startsWith(servicePrefix) && JSON.parse(raw).some((s: { id: string; active: boolean }) => s.id === serviceId && s.active))
    if (!owner) throw new RequestError("Service is no longer available.", 404)
    const from = bookingCore.manilaToday()
    return availability.unavailableDates(decodeURIComponent(owner[0].slice(servicePrefix.length)), from, new Date(Date.parse(from + "T00:00:00Z") + 365 * 86400000).toISOString().slice(0, 10))
  },
  toggleScheduleDate: async date => {
    const result = await availability.toggleBlockedDate(payer(requireRole("provider")), date)
    billing.recordMarketplaceAction("Schedule availability changed", result.date, result.blocked ? "Available" : "Blocked", result.blocked ? "Blocked" : "Available")
    return result
  },
  setWeeklyAvailability: weekdays => availability.setWeeklyDays(payer(requireRole("provider")), weekdays),
  createUploadUrl: async (kind, meta) => {
    if (!isFileKind(kind)) throw new RequestError("Unknown upload type.")
    const rules = KIND_RULES[kind]
    const actor = requireRole(...rules.roles)
    const m = record(meta)
    const type = String(m.type || ""), size = m.size
    if (!rules.types.includes(type) || typeof size !== "number" || !Number.isInteger(size) || size <= 0 || size > rules.maxBytes) throw new RequestError(rules.message)
    if (kind === "service-image" && m.serviceId !== undefined) {
      const serviceId = text(m.serviceId, 100)
      if (Object.entries(storage.values).some(([k, raw]) => k.startsWith(servicePrefix) && k !== keyFor(servicePrefix, actor.email) && JSON.parse(raw).some((s: { id: string }) => s.id === serviceId))) throw new RequestError("You can only upload images for your own services.", 403)
    }
    const key = buildKey(kind, actor.email, crypto.randomUUID(), type)
    return { key, ...(await presignPut(key, type, size, 600)) }
  },
  getProviderDocumentUrl: async (email, index) => {
    const actor = requireRole("provider", "admin")
    const owner = text(email, 254).toLowerCase()
    if (actor.role !== "admin" && actor.email.toLowerCase() !== owner) throw new RequestError("You do not have permission for this operation.", 403)
    const doc = allAccounts().find(a => a.role === "provider" && a.email.toLowerCase() === owner)?.application?.documents[Number.isInteger(index) ? index : -1] as { name: string; type: string; key?: string } | undefined
    if (!doc) throw new RequestError("Document not found.", 404)
    if (!isOwnKey("provider-document", owner, doc.key)) throw new RequestError("This document has not been moved to file storage yet.", 409)
    return { ...(await presignGet(doc.key!, 300, doc.name)), name: doc.name, type: doc.type }
  },
  updateProviderAccount: v => updateProfile(v, "provider"),
  updateClientAccount: v => updateProfile(v, "client"),
  submitProviderApplication: async docs => {
    const actor = requireRole("provider")
    if (!Array.isArray(docs)) throw new RequestError("Invalid documents.")
    try { auth.validateProviderDocuments(docs, actor.email) } catch (error) { throw new RequestError((error as Error).message) }
    for (const doc of docs) {
      const head = await headObject(doc.key)
      if (!head || head.size > KIND_RULES["provider-document"].maxBytes || !KIND_RULES["provider-document"].types.includes(head.type)) throw new RequestError("The upload did not finish. Please try again.")
    }
    const previous = actor.application?.documents || []
    const result = auth.submitProviderApplication(docs)
    for (const old of previous) if (isOwnKey("provider-document", actor.email, old.key) && !docs.some(d => d.key === old.key)) queueDelete(old.key)
    return result
  },
  reviewProviderApplication: (email, status, reason) => { requireRole("admin"); return auth.reviewProviderApplication(text(email, 254), status, String(reason || "").slice(0, 1000)) },
  saveProviderService: async v => {
    const service = await serviceInput(v)
    if (services.getProviderServices("current").some(s => s.id === service.id)) throw new RequestError("This service already exists.")
    return services.saveProviderService(service)
  },
  updateProviderServices: async values => {
    if (!Array.isArray(values) || values.length > 500) throw new RequestError("Invalid services.")
    const actor = requireRole("provider")
    const current = services.getProviderServices("current")
    const next = await Promise.all(values.map(v => serviceInput(v, current)))
    if (new Set(next.map(s => s.id)).size !== next.length) throw new RequestError("Duplicate services.")
    const retained = new Set(next.map(s => s.id))
    const booked = new Set((await currentTx()<{ package_id: string }[]>`select distinct package_id from soundstage.bookings where provider_email = ${actor.email.toLowerCase()}`).map(r => r.package_id))
    for (const old of services.getProviderServices("current")) if (!retained.has(old.id) && booked.has(old.id)) throw new RequestError("Deactivate services with existing bookings instead of deleting them.")
    const result = services.updateProviderServices(next)
    for (const old of current) {
      const kept = next.find(s => s.id === old.id)
      if (kept?.image === old.image) continue
      // Another saved service may still use the old key (renamed id or shared image).
      if (isOwnKey("service-image", actor.email, old.image) && !next.some(s => s.image === old.image)) queueDelete(old.image)
    }
    return result
  },
  saveClientBooking: async value => {
    const actor = requireRole("client")
    const v = record(value)
    // A booking is a request; the client pays after the provider accepts (booking plan 4).
    return bookingCore.createBooking(payer(actor), v as bookingCore.BookingInput, typeof v.idempotencyKey === "string" ? v.idempotencyKey : "")
  },
  updateClientBookingStatus: (id, status) => {
    requireRole("client", "provider")
    if (typeof status !== "string") throw new RequestError("Invalid booking status.")
    return bookings.updateClientBookingStatus(id, status)
  },
  acceptBooking: id => bookingCore.transition(id, "accepted", payer(requireRole("provider"))),
  declineBooking: (id, reason) => bookingCore.transition(id, "declined", payer(requireRole("provider")), reason),
  // Provider cancellation needs the provider's own reason (spec transition table).
  cancelEvent: (id, reason) => bookingCore.transition(id, "cancelled", payer(requireRole("provider")), reason),
  startEvent: id => bookingCore.transition(id, "in_progress", payer(requireRole("provider"))),
  completeEvent: id => bookingCore.transition(id, "completed", payer(requireRole("provider"))),
  requestReschedule: (id, start, durationDays, reason) => bookingRequests.requestReschedule(payer(requireRole("client")), id, start, durationDays, reason),
  decideReschedule: (requestId, approve) => bookingRequests.decideReschedule(payer(requireRole("provider")), requestId, approve),
  requestCancellation: (id, reason) => bookingRequests.requestCancellation(payer(requireRole("client")), id, reason),
  decideCancellation: (requestId, approve) => bookingRequests.decideCancellation(payer(requireRole("provider")), requestId, approve),
  submitEventFeedback: (id, rating, comment) => bookingView.submitFeedback(payer(requireRole("client")), id, rating, comment),
  requestBookingRefund: (id, method, account) => bookingView.requestRefund(payer(requireRole("client")), id, method, account),
  // Refund decisions belong to the payroll master only (booking AC26).
  reviewBookingRefund: (id, status, details) => bookingView.reviewRefund(payer(requireRole("payroll_master")), id, status, details),
  createSubscriptionCheckout: async (name, method) => {
    const actor = requireRole("provider")
    const plan = billing.plans.find(p => p.name === name)
    if (!plan) throw new RequestError("Select a plan.")
    billing.ensureProviderTrial(actor.email)
    // One open subscription checkout per provider (D12); the webhook activates it (AC19).
    return checkout.startCheckout({ ownerEmail: actor.email, targetKind: "subscription", targetId: actor.email.toLowerCase(), type: "subscription", name: plan.name + " subscription", amount: plan.amount, method: text(method, 50), plan: plan.name })
  },
  startBookingPayment: (...args) => {
    // Amounts are computed on the server; any extra argument is refused (AC4).
    if (args.length > 3) throw new RequestError("Invalid input.")
    return checkout.startBookingPayment(payer(requireRole("client")), args[0], args[1], args[2])
  },
  getPaymentStatus: id => checkout.getPaymentStatus(payer(requireRole("client", "provider", "admin")), id),
  cancelPayment: id => checkout.cancelPayment(payer(requireRole("client", "provider")), id),
  submitSubscriptionPayment: (plan, method, reference) => { requireRole("provider"); return billing.submitSubscriptionPayment(plan, method, text(reference, 100)) },
  reviewSubscriptionPayment: (id, status) => { requireRole("payroll_master", "admin"); if (!["Paid", "Rejected"].includes(status)) throw new RequestError("Invalid payment status."); return billing.reviewSubscriptionPayment(id, status) },
  sendBookingMessage: async value => {
    const actor = requireRole("client", "provider"), v = record(value), booking = await ownBooking(v.bookingId)
    return communications.sendBookingMessage({ bookingId: booking.id, client: booking.client, provider: booking.provider, senderRole: actor.role as "client" | "provider", senderName: actor.role === "provider" ? providerName(actor) : fullName(actor), body: text(v.body, 4000) })
  },
  submitProviderReport: async value => {
    const actor = requireRole("client"), v = record(value), booking = await ownBooking(v.bookingId, "client")
    return communications.submitProviderReport({ bookingId: booking.id, client: booking.client, clientEmail: actor.email, provider: booking.provider, reason: text(v.reason, 500), details: text(v.details, 2000) })
  },
  updateProviderReportStatus: (id, status) => { requireRole("payroll_master"); if (status !== "Resolved") throw new RequestError("Invalid report status."); return communications.updateProviderReportStatus(id, status) },
  createWithdrawalRequest: async value => {
    const actor = requireRole("provider"), v = record(value)
    // Verified, non-demo money on completed bookings only.
    const earned = await bookingView.completedEarnings(actor.email)
    const reserved = withdrawals.getWithdrawalRequests().filter(w => w.providerEmail === actor.email && w.status !== "Rejected").reduce((sum, w) => sum + w.amount, 0)
    const amount = finite(v.amount, 1)
    if (amount > earned - reserved) throw new RequestError("Withdrawal exceeds your available verified balance. Demo payments cannot be withdrawn.")
    return withdrawals.createWithdrawalRequest({ provider: providerName(actor), providerEmail: actor.email, amount, payoutMethod: text(v.payoutMethod, 50), payoutAccount: text(v.payoutAccount, 255) })
  },
  updateWithdrawalStatus: (id, status) => { requireRole("payroll_master", "admin"); if (!["Paid", "Rejected"].includes(status)) throw new RequestError("Invalid withdrawal status."); return withdrawals.updateWithdrawalStatus(id, status) },
}

async function publicServiceRatings() {
  return JSON.stringify(buildServiceRatings(await bookingView.completedWithFeedback()))
}

// Booking keys are built from the tables in the legacy shape; the JSON copies are never sent (booking plan 4).
async function bookingRecords(actor: ClientAccount | null) {
  const visible = await bookingView.listVisible(actor ? { email: actor.email, role: actor.role } : null)
  const byClient = new Map<string, Booking[]>()
  for (const { clientEmail, booking } of visible) byClient.set(clientEmail, [...(byClient.get(clientEmail) || []), booking])
  return { ids: new Set(visible.map(v => v.booking.id)), records: Object.fromEntries([...byClient].map(([email, rows]) => [keyFor(bookingPrefix, email), JSON.stringify(rows)])) }
}

export async function visibleRecords() {
  const actor = auth.getAccount()
  const ratings = await publicServiceRatings()
  const own = await bookingRecords(actor)
  if (actor?.role === "admin") return { ...Object.fromEntries(Object.entries(storage.values).filter(([key]) => !key.startsWith(bookingPrefix))), ...own.records, [SERVICE_RATINGS_KEY]: ratings }
  const result: Record<string, string> = { [SERVICE_RATINGS_KEY]: ratings, ...own.records }
  const providers = allAccounts().filter(a => a.role === "provider" && a.application?.status === "Approved")
  const publicProfiles = providers.filter(a => a.email !== actor?.email).map(a => ({ firstName: a.firstName, lastName: a.lastName, email: a.email, mobile: "", business: a.business, bio: a.bio, profileImage: a.profileImage, role: a.role, authMethod: a.authMethod, application: { status: "Approved", documents: [], submittedAt: "" } }))
  result[accountsKey] = JSON.stringify([...publicProfiles, ...(actor ? [actor] : [])])
  const permittedIds = actor?.role === "payroll_master" ? new Set<string>() : own.ids
  for (const [key, raw] of Object.entries(storage.values)) {
    if (key.startsWith(servicePrefix)) {
      const email = decodeURIComponent(key.slice(servicePrefix.length))
      if (actor?.role === "provider" && email === actor.email.toLowerCase()) result[key] = raw
      else if (providers.some(p => p.email.toLowerCase() === email)) result[key] = JSON.stringify(JSON.parse(raw).filter((s: { active: boolean }) => s.active))
    }
  }
  if (actor) {
    for (const key of [keyFor("soundstage-schedule:", actor.email), `soundstage-event-notifications:${actor.role}:${actor.email.toLowerCase()}`]) if (storage.getItem(key)) result[key] = storage.getItem(key)!
    for (const key of ["soundstage-booking-messages-v1", "soundstage-provider-reports-v1"]) result[key] = JSON.stringify(JSON.parse(storage.getItem(key) || "[]").filter((v: { bookingId: string }) => permittedIds.has(v.bookingId)))
    if (actor.role === "payroll_master") result["soundstage-provider-reports-v1"] = storage.getItem("soundstage-provider-reports-v1") || "[]"
    const payroll = actor.role === "payroll_master"
    result["soundstage-withdrawals-v1"] = JSON.stringify(withdrawals.getWithdrawalRequests().filter(w => payroll || w.providerEmail === actor.email))
    const state = JSON.parse(storage.getItem(billingKey) || '{"subscriptions":[],"payments":[],"audit":[]}')
    result[billingKey] = payroll ? JSON.stringify(state) : JSON.stringify({ subscriptions: state.subscriptions.filter((s: { email: string }) => s.email === actor.email.toLowerCase()), payments: state.payments.filter((p: { email: string }) => p.email === actor.email.toLowerCase()), audit: [] })
  }
  return result
}

export async function authenticate(request: Request, _options: { allowUnverifiedPhone?: boolean } = {}): Promise<AppIdentity | null> {
  const header = request.headers.get("authorization")
  if (!header) return null
  if (!header.startsWith("Bearer ")) throw new RequestError("Invalid session.", 401)
  if (request.headers.get("x-auth-provider") === "clerk") {
    if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new RequestError("Sign-in is not configured.", 503)
    try { return await (await import("./auth/clerk-auth")).authenticateClerk(request) }
    catch { throw new RequestError("Session could not be verified. Please sign in again.", 401) }
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error } = await client.auth.getUser(header.slice(7))
  if (error || !user || !user.email || !user.email_confirmed_at) throw new RequestError("Sign in with a verified account.", 401)
  return user
}

export async function execute(user: AppIdentity | null, action?: string, args: unknown[] = [], signupRole?: string, webhook?: () => Promise<unknown>) {
  if (action && !user) throw new RequestError("Sign in to continue.", 401)
  if (action && !Object.hasOwn(actions, action)) throw new RequestError("Unknown operation.", 404)
  const sql = getDatabase()
  const pendingDeletes: string[] = []
  const response = await sql.begin(async tx => {
    // Serialize read/modify/write workflows so approvals, dates and balances stay consistent.
    await tx`select pg_advisory_xact_lock(74832019)`
    const rows = await tx<{ key: string; value: unknown }[]>`select key, value from soundstage.records`
    const originalValues = new Map(rows.map(r => [r.key, JSON.stringify(r.value)]))
    const values = Object.fromEntries(originalValues)
    const state = { storage: new MemoryStorage(values), session: new MemoryStorage(), pendingDeletes, tx: tx as unknown as Tx }
    return context.run(state, async () => {
      if (user) {
        const isClerk = user.authSource === "clerk"; let identity: { email: string; role: string }
        if (isClerk) {
          const profile = await ensureProfile(tx, user, signupRole); if (profile.status !== "active") throw new RequestError(`This account is ${profile.status}.`, 403); identity = { email: profile.email, role: profile.role }
        } else {
          const identities = await tx<{ email: string; role: string }[]>`select email, role from soundstage.identities where auth_id = ${user.id}`
          identity = identities[0]
          if (!identity) {
            const email = user.email!.toLowerCase()
            const imported = allAccounts().find(a => a.email.toLowerCase() === email && a.role !== "admin")
            const role = user.app_metadata.role === "admin" ? "admin" : imported?.role || (user.user_metadata.role === "provider" || signupRole === "provider" ? "provider" : "client")
            await tx`insert into soundstage.identities (auth_id,email,role) values (${user.id},${email},${role})`
            identity = { email, role }
          }
          const migrated = await tx`select 1 from soundstage.profiles where email=${identity.email}`
          if (migrated.length) throw new RequestError("Your account now signs in with the new sign-in. Use Forgot password to set your password.", 403)
          if (user.app_metadata.role === "admin" && identity.role !== "admin") {
            await tx`update soundstage.identities set role='admin' where auth_id=${user.id}`
            // Bookings live in the table now; the JSON copy only covers unmigrated history (review-4 m1).
            const [booked] = await tx`select 1 from soundstage.bookings where client_email = ${identity.email} or provider_email = ${identity.email} limit 1`
            const hasBusinessData = !!booked || [keyFor(bookingPrefix, identity.email), keyFor(servicePrefix, identity.email)].some(key => JSON.parse(storage.getItem(key) || "[]").length)
            if (!hasBusinessData) storage.setItem(accountsKey, JSON.stringify(allAccounts().filter(a => a.email.toLowerCase() !== identity.email)))
            identity = { ...identity, role: "admin" }
          }
          if (identity.role === "admin" && user.app_metadata.role !== "admin") throw new RequestError("Administrator access was revoked.", 403)
        }
        if (identity.email !== user.email!.toLowerCase()) throw new RequestError("Your email changed. Contact support to migrate your account records.", 409)
        let account = allAccounts().find(a => a.email.toLowerCase() === identity.email && a.role === identity.role)
        if (!account) {
          const m = user.user_metadata
          account = { firstName: String(m.firstName || m.given_name || "New").slice(0, 100), lastName: String(m.lastName || m.family_name || "User").slice(0, 100), email: identity.email, role: identity.role as ClientAccount["role"], mobile: String(m.mobile || "").slice(0, 32), authMethod: user.app_metadata.provider === "google" ? "google" : "email", ...(identity.role === "provider" ? { business: String(m.business || "").slice(0, 200) } : {}) }
          storage.setItem(accountsKey, JSON.stringify([...allAccounts(), account]))
        }
        if (account.role === "admin") storage.setItem("soundstage-admin-account", JSON.stringify(account))
        session.setItem("soundstage-session", JSON.stringify({ role: account.role, email: account.email }))
        if (account.role === "provider" && account.application?.status === "Approved") billing.ensureProviderTrial(account.email)
        assertProviderActionAllowed(identity.role, auth.isProviderApproved(identity.email), action, args)
      }
      let result = action ? await actions[action](...args) : null
      // Verified PayMongo events run server-side in this same transaction; never a browser action.
      if (webhook) result = await webhook()
      for (const [key, value] of Object.entries(storage.values)) {
        if (key === "soundstage-admin-account") continue
        // Booking JSON is the rollback copy now; nothing may change it (booking plan 4).
        if (key.startsWith(bookingPrefix) && originalValues.get(key) !== value) throw new Error("Booking records are read-only.")
        if (originalValues.get(key) !== value) await tx`insert into soundstage.records (key,value) values (${key},${tx.json(JSON.parse(value))}) on conflict (key) do update set value=excluded.value, updated_at=now()`
      }
      for (const row of rows) if (!(row.key in storage.values) && row.key.startsWith(bookingPrefix)) throw new Error("Booking records are read-only.")
      for (const row of rows) if (!(row.key in storage.values)) await tx`delete from soundstage.records where key=${row.key}`
      return { records: await visibleRecords(), session: { ...session.values }, result, filesBaseUrl: publicBaseUrl() }
    })
  })
  // A failed delete never undoes the committed action; the orphaned key is logged for cleanup.
  const outcomes = await Promise.allSettled(pendingDeletes.map(key => deleteObject(key)))
  outcomes.forEach((outcome, i) => { if (outcome.status === "rejected") console.error("R2 delete failed", { key: pendingDeletes[i] }) })
  return response
}
