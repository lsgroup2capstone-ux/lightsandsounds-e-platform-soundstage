import { createClient } from "@supabase/supabase-js"
import type { AppIdentity } from "./clerk-auth"
import { getDatabase } from "./database"
import { MemoryStorage } from "../memory-storage"
import { context, storage, session } from "./runtime"
import * as auth from "./domain/client-auth"
import * as bookings from "./domain/client-bookings"
import * as services from "./domain/provider-services"
import * as billing from "./domain/marketplace-billing"
import * as communications from "./domain/communications"
import * as withdrawals from "./domain/withdrawals"
import type { ClientAccount } from "../client-auth"
import type { Booking } from "../mock-data"
import { isAreaCovered, getTownDistance, getTransportationFee } from "../booking-pricing"
import { importLegacyRecords } from "./legacy-import"

export class RequestError extends Error { constructor(message: string, public status = 400) { super(message) } }
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
function ownBooking(id: unknown, role?: "client" | "provider") {
  const actor = requireRole(role || "client", ...(role ? [] : ["provider", "admin"]))
  const booking = bookings.getAllBookings().find(b => b.id === id)
  const owned = actor.role === "admin" || (actor.role === "client"
    ? JSON.parse(storage.getItem(keyFor(bookingPrefix, actor.email)) || "[]").some((b: Booking) => b.id === id)
    : ownsProviderBooking(actor, booking))
  if (!booking || !owned) throw new RequestError("Booking not found.", 404)
  return booking
}
function ownsProviderBooking(actor: ClientAccount, booking?: Booking) {
  if (!booking) return false
  // Ownership follows the stored service key, never a caller-supplied display name.
  const own = JSON.parse(storage.getItem(keyFor(servicePrefix, actor.email)) || "[]") as { id: string }[]
  return own.some(s => s.id === booking.packageId)
}
function serviceInput(value: unknown) {
  const a = requireRole("provider")
  const v = record(value)
  const id = text(v.id, 100)
  if (Object.entries(storage.values).some(([k, raw]) => k.startsWith(servicePrefix) && k !== keyFor(servicePrefix, a.email) && JSON.parse(raw).some((s: { id: string }) => s.id === id))) throw new RequestError("Service ID already exists.")
  return { id, name: text(v.name, 200), location: text(v.location, 200), coverageAreas: text(v.coverageAreas || v.location, 2000), transportationFee: finite(v.transportationFee || 0), description: String(v.description || "").slice(0, 5000), price: finite(v.price, 1), image: String(v.image || "").slice(0, 1500000), providerName: providerName(a), active: v.active === true, bookings: 0 }
}
function updateProfile(value: unknown, role: "client" | "provider") {
  const actor = requireRole(role)
  const input = record(value)
  if (input.email && String(input.email).toLowerCase() !== actor.email.toLowerCase()) throw new RequestError("Email changes require verification through Supabase Auth; contact support.")
  const changes: Record<string, string> = {}
  for (const key of ["firstName", "lastName", "mobile", "business", "bio", "profileImage"]) if (key in input && (role === "provider" || !["business", "bio"].includes(key))) changes[key] = String(input[key] || "").slice(0, key === "profileImage" ? 1500000 : 2000)
  if (changes.business && changes.business !== actor.business) {
    if (allAccounts().some(a => a.email !== actor.email && a.role === "provider" && providerName(a) === changes.business)) throw new RequestError("That business name is already registered.")
  }
  const result = role === "provider" ? auth.updateProviderAccount(changes) : auth.updateClientAccount(changes)
  if (role === "provider" && result) {
    const ownKey = keyFor(servicePrefix, actor.email)
    const own = JSON.parse(storage.getItem(ownKey) || "[]")
    const ids = new Set(own.map((s: { id: string }) => s.id))
    storage.setItem(ownKey, JSON.stringify(own.map((s: object) => ({ ...s, providerName: providerName(result) }))))
    for (const [key, raw] of Object.entries(storage.values)) if (key.startsWith(bookingPrefix)) storage.setItem(key, JSON.stringify(JSON.parse(raw).map((b: Booking) => ids.has(b.packageId) ? { ...b, provider: providerName(result) } : b)))
  }
  return result
}

// This allowlist is the only browser-accessible write surface. Domain helpers are not RPCs.
export const actions: Record<string, (...args: any[]) => unknown> = {
  importLegacyRecords,
  setNotificationReads: ids => {
    const actor = requireRole("client", "provider", "admin")
    if (!Array.isArray(ids) || ids.length > 10000 || ids.some(id => typeof id !== "string")) throw new RequestError("Invalid notifications.")
    storage.setItem(`soundstage-event-notifications:${actor.role}:${actor.email.toLowerCase()}`, JSON.stringify(ids))
  },
  toggleScheduleDate: date => {
    const actor = requireRole("provider")
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new RequestError("Invalid date.")
    const key = keyFor("soundstage-schedule:", actor.email)
    const dates: string[] = JSON.parse(storage.getItem(key) || "[]")
    const blocked = dates.includes(date)
    storage.setItem(key, JSON.stringify(blocked ? dates.filter(d => d !== date) : [...dates, date]))
    billing.recordMarketplaceAction("Schedule availability changed", date, blocked ? "Blocked" : "Available", blocked ? "Available" : "Blocked")
  },
  updateProviderAccount: v => updateProfile(v, "provider"),
  updateClientAccount: v => updateProfile(v, "client"),
  submitProviderApplication: docs => { requireRole("provider"); if (!Array.isArray(docs)) throw new RequestError("Invalid documents."); return auth.submitProviderApplication(docs) },
  reviewProviderApplication: (email, status, reason) => { requireRole("admin"); return auth.reviewProviderApplication(text(email, 254), status, String(reason || "").slice(0, 1000)) },
  saveProviderService: v => {
    const service = serviceInput(v)
    if (services.getProviderServices("current").some(s => s.id === service.id)) throw new RequestError("This service already exists.")
    return services.saveProviderService(service)
  },
  updateProviderServices: values => {
    if (!Array.isArray(values) || values.length > 500) throw new RequestError("Invalid services.")
    const next = values.map(serviceInput)
    if (new Set(next.map(s => s.id)).size !== next.length) throw new RequestError("Duplicate services.")
    const retained = new Set(next.map(s => s.id))
    for (const old of services.getProviderServices("current")) if (!retained.has(old.id) && bookings.getAllBookings().some(b => b.packageId === old.id)) throw new RequestError("Deactivate services with existing bookings instead of deleting them.")
    return services.updateProviderServices(next)
  },
  saveClientBooking: value => {
    const actor = requireRole("client")
    const v = record(value)
    const service = services.getProviderServices().find(s => s.id === v.packageId && s.active)
    if (!service) throw new RequestError("Service is no longer available.")
    const duration = finite(v.durationDays || 1, 1, 30)
    if (!Number.isInteger(duration) || !Number.isInteger(v.guests)) throw new RequestError("Use whole numbers for guests and days.")
    const date = text(v.date, 10)
    const start = Date.parse(date + "T00:00:00Z")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== date) throw new RequestError("Invalid event date.")
    const owner = Object.entries(storage.values).find(([key, raw]) => key.startsWith(servicePrefix) && JSON.parse(raw).some((s: { id: string }) => s.id === service.id))![0]
    const providerIds = new Set((JSON.parse(storage.getItem(owner)!) as { id: string }[]).map(s => s.id))
    const blocked: string[] = JSON.parse(storage.getItem("soundstage-schedule:" + owner.slice(servicePrefix.length)) || "[]")
    if (blocked.some(d => Date.parse(d + "T00:00:00Z") >= start && Date.parse(d + "T00:00:00Z") < start + duration * 86400000)) throw new RequestError("This provider has blocked a selected date.")
    if (bookings.getAllBookings().some(b => providerIds.has(b.packageId) && b.status !== "Cancelled" && start < Date.parse(b.date + "T00:00:00Z") + (b.durationDays || 1) * 86400000 && start + duration * 86400000 > Date.parse(b.date + "T00:00:00Z"))) throw new RequestError("This provider is already booked for those dates.")
    const base = Math.round(service.price * (1 + .38 * (duration - 1)))
    const eventTown = text(v.eventTown, 200)
    const outside = !isAreaCovered(eventTown, service.coverageAreas || service.location)
    const townsAway = outside ? getTownDistance(service.coverageAreas || service.location, eventTown) : 0
    const transportationFee = outside ? getTransportationFee(eventTown, townsAway) : 0
    const total = base + transportationFee
    const demo = process.env.ENABLE_DEMO_PAYMENTS === "true"
    if (!demo) throw new RequestError("Checkout is not enabled. Configure a payment integration, or enable demo payments for testing.")
    const saved: Booking = { id: crypto.randomUUID(), packageId: service.id, packageName: service.name, provider: service.providerName, client: fullName(actor), image: service.image, date, time: text(v.time, 64), ...(v.eventType !== undefined ? { eventType: text(v.eventType, 100) } : {}), location: text(v.location, 500), guests: finite(v.guests, 1, 100000), notes: String(v.notes || "").slice(0, 5000), durationDays: duration, basePrice: service.price, transportationFee, eventTown, townsAway, total, downpayment: Math.round(total * .3), status: "Pending", paid: true, paidAt: new Date().toISOString(), paymentMethod: `DEMO: ${text(v.paymentMethod, 50)}` }
    bookings.saveClientBooking(saved)
    return saved
  },
  updateClientBookingStatus: (id, status) => { ownBooking(id); if (!["Confirmed", "Cancelled", "Completed"].includes(status)) throw new RequestError("Invalid booking status."); return bookings.updateClientBookingStatus(id, status) },
  submitEventFeedback: (id, rating, comment) => { ownBooking(id, "client"); return bookings.submitEventFeedback(id, rating, text(comment, 2000)) },
  requestBookingRefund: (id, method, account) => { ownBooking(id, "client"); return bookings.requestBookingRefund(id, method, text(account, 200)) },
  reviewBookingRefund: (id, status, details) => { requireRole("admin"); return bookings.reviewBookingRefund(id, status, text(details, 200)) },
  payDemoSubscription: (plan, method) => { requireRole("provider"); if (process.env.ENABLE_DEMO_PAYMENTS !== "true") throw new RequestError("Demo payments are disabled."); return billing.payDemoSubscription(plan, method) },
  submitSubscriptionPayment: (plan, method, reference) => { requireRole("provider"); return billing.submitSubscriptionPayment(plan, method, text(reference, 100)) },
  reviewSubscriptionPayment: (id, status) => { requireRole("admin"); if (!["Paid", "Rejected"].includes(status)) throw new RequestError("Invalid payment status."); return billing.reviewSubscriptionPayment(id, status) },
  sendBookingMessage: value => {
    const actor = requireRole("client", "provider"), v = record(value), booking = ownBooking(v.bookingId)
    return communications.sendBookingMessage({ bookingId: booking.id, client: booking.client, provider: booking.provider, senderRole: actor.role as "client" | "provider", senderName: actor.role === "provider" ? providerName(actor) : fullName(actor), body: text(v.body, 4000) })
  },
  submitProviderReport: value => {
    const actor = requireRole("client"), v = record(value), booking = ownBooking(v.bookingId, "client")
    return communications.submitProviderReport({ bookingId: booking.id, client: booking.client, clientEmail: actor.email, provider: booking.provider, reason: text(v.reason, 500), details: text(v.details, 2000) })
  },
  updateProviderReportStatus: (id, status) => { requireRole("admin"); if (status !== "Resolved") throw new RequestError("Invalid report status."); return communications.updateProviderReportStatus(id, status) },
  createWithdrawalRequest: value => {
    const actor = requireRole("provider"), v = record(value)
    const earned = bookings.getAllBookings().filter(b => ownsProviderBooking(actor, b) && b.status === "Completed" && b.paid && !b.paymentMethod?.startsWith("DEMO:")).reduce((sum, b) => sum + b.downpayment, 0)
    const reserved = withdrawals.getWithdrawalRequests().filter(w => w.providerEmail === actor.email && w.status !== "Rejected").reduce((sum, w) => sum + w.amount, 0)
    const amount = finite(v.amount, 1)
    if (amount > earned - reserved) throw new RequestError("Withdrawal exceeds your available verified balance. Demo payments cannot be withdrawn.")
    return withdrawals.createWithdrawalRequest({ provider: providerName(actor), providerEmail: actor.email, amount, payoutMethod: text(v.payoutMethod, 50), payoutAccount: text(v.payoutAccount, 255) })
  },
  updateWithdrawalStatus: (id, status) => { requireRole("admin"); if (!["Paid", "Rejected"].includes(status)) throw new RequestError("Invalid withdrawal status."); return withdrawals.updateWithdrawalStatus(id, status) },
}

export function visibleRecords() {
  const actor = auth.getAccount()
  if (actor?.role === "admin") return { ...storage.values }
  const result: Record<string, string> = {}
  const providers = allAccounts().filter(a => a.role === "provider" && a.application?.status === "Approved")
  const publicProfiles = providers.filter(a => a.email !== actor?.email).map(a => ({ firstName: a.firstName, lastName: a.lastName, email: a.email, mobile: "", business: a.business, bio: a.bio, profileImage: a.profileImage, role: a.role, authMethod: a.authMethod, application: { status: "Approved", documents: [], submittedAt: "" } }))
  result[accountsKey] = JSON.stringify([...publicProfiles, ...(actor ? [actor] : [])])
  const permittedIds = new Set<string>()
  for (const [key, raw] of Object.entries(storage.values)) {
    if (key.startsWith(servicePrefix)) {
      const email = decodeURIComponent(key.slice(servicePrefix.length))
      if (actor?.role === "provider" && email === actor.email.toLowerCase()) result[key] = raw
      else if (providers.some(p => p.email.toLowerCase() === email)) result[key] = JSON.stringify(JSON.parse(raw).filter((s: { active: boolean }) => s.active))
    }
    if (key.startsWith(bookingPrefix) && actor) {
      const own = actor.role === "client" && key === keyFor(bookingPrefix, actor.email)
      const rows = (JSON.parse(raw) as Booking[]).filter(b => own || actor.role === "provider" && ownsProviderBooking(actor, b))
      for (const b of rows) permittedIds.add(b.id)
      if (rows.length) result[key] = JSON.stringify(rows)
    }
  }
  if (actor) {
    for (const key of [keyFor("soundstage-schedule:", actor.email), `soundstage-event-notifications:${actor.role}:${actor.email.toLowerCase()}`]) if (storage.getItem(key)) result[key] = storage.getItem(key)!
    for (const key of ["soundstage-booking-messages-v1", "soundstage-provider-reports-v1"]) result[key] = JSON.stringify(JSON.parse(storage.getItem(key) || "[]").filter((v: { bookingId: string }) => permittedIds.has(v.bookingId)))
    result["soundstage-withdrawals-v1"] = JSON.stringify(withdrawals.getWithdrawalRequests().filter(w => w.providerEmail === actor.email))
    const state = JSON.parse(storage.getItem(billingKey) || '{"subscriptions":[],"payments":[],"audit":[]}')
    result[billingKey] = JSON.stringify({ subscriptions: state.subscriptions.filter((s: { email: string }) => s.email === actor.email.toLowerCase()), payments: state.payments.filter((p: { email: string }) => p.email === actor.email.toLowerCase()), audit: [] })
  }
  return result
}

export async function authenticate(request: Request, _options: { allowUnverifiedPhone?: boolean } = {}): Promise<AppIdentity | null> {
  const header = request.headers.get("authorization")
  if (!header) return null
  if (!header.startsWith("Bearer ")) throw new RequestError("Invalid session.", 401)
  if (request.headers.get("x-auth-provider") === "clerk") {
    if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new RequestError("Sign-in is not configured.", 503)
    try { return await (await import("./clerk-auth")).authenticateClerk(request) }
    catch { throw new RequestError("Session could not be verified. Please sign in again.", 401) }
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error } = await client.auth.getUser(header.slice(7))
  if (error || !user || !user.email || !user.email_confirmed_at) throw new RequestError("Sign in with a verified account.", 401)
  return user
}

export async function execute(user: AppIdentity | null, action?: string, args: unknown[] = [], signupRole?: string) {
  if (action && !user) throw new RequestError("Sign in to continue.", 401)
  if (action && !Object.hasOwn(actions, action)) throw new RequestError("Unknown operation.", 404)
  const sql = getDatabase()
  return sql.begin(async tx => {
    // Serialize read/modify/write workflows so approvals, dates and balances stay consistent.
    await tx`select pg_advisory_xact_lock(74832019)`
    const rows = await tx<{ key: string; value: unknown }[]>`select key, value from soundstage.records`
    const originalValues = new Map(rows.map(r => [r.key, JSON.stringify(r.value)]))
    const values = Object.fromEntries(originalValues)
    const state = { storage: new MemoryStorage(values), session: new MemoryStorage() }
    return context.run(state, async () => {
      if (user) {
        const isClerk = user.authSource === "clerk"
        if (isClerk) {
          const existing = await tx<{ role: string }[]>`select role from soundstage.identities where email = ${user.email!.toLowerCase()}`
          if (existing[0]?.role === "admin") throw new RequestError("Use your administrator sign-in method for this account.", 403)
        }
        const identities = isClerk
          ? await tx<{ email: string; role: string }[]>`select email, role from soundstage.clerk_identities where clerk_id = ${user.id}`
          : await tx<{ email: string; role: string }[]>`select email, role from soundstage.identities where auth_id = ${user.id}`
        let identity = identities[0]
        if (!identity) {
          const email = user.email!.toLowerCase()
          const imported = allAccounts().find(a => a.email.toLowerCase() === email && a.role !== "admin")
          const role = user.app_metadata.role === "admin" ? "admin" : imported?.role || (user.user_metadata.role === "provider" || signupRole === "provider" ? "provider" : "client")
          if (isClerk) await tx`insert into soundstage.clerk_identities (clerk_id,email,role) values (${user.id},${email},${role})`
          else await tx`insert into soundstage.identities (auth_id,email,role) values (${user.id},${email},${role})`
          identity = { email, role }
        }
        if (user.app_metadata.role === "admin" && identity.role !== "admin") {
          await tx`update soundstage.identities set role='admin' where auth_id=${user.id}`
          const hasBusinessData = [keyFor(bookingPrefix, identity.email), keyFor(servicePrefix, identity.email)].some(key => JSON.parse(storage.getItem(key) || "[]").length)
          if (!hasBusinessData) storage.setItem(accountsKey, JSON.stringify(allAccounts().filter(a => a.email.toLowerCase() !== identity.email)))
          identity = { ...identity, role: "admin" }
        }
        if (identity.email !== user.email!.toLowerCase()) throw new RequestError("Your email changed. Contact support to migrate your account records.", 409)
        if (identity.role === "admin" && user.app_metadata.role !== "admin") throw new RequestError("Administrator access was revoked.", 403)
        let account = allAccounts().find(a => a.email.toLowerCase() === identity.email && a.role === identity.role)
        if (!account) {
          const m = user.user_metadata
          account = { firstName: String(m.firstName || m.given_name || "New").slice(0, 100), lastName: String(m.lastName || m.family_name || "User").slice(0, 100), email: identity.email, role: identity.role as ClientAccount["role"], mobile: String(m.mobile || "").slice(0, 32), authMethod: user.app_metadata.provider === "google" ? "google" : "email", ...(identity.role === "provider" ? { business: String(m.business || "").slice(0, 200) } : {}) }
          storage.setItem(accountsKey, JSON.stringify([...allAccounts(), account]))
        }
        if (account.role === "admin") storage.setItem("soundstage-admin-account", JSON.stringify(account))
        session.setItem("soundstage-session", JSON.stringify({ role: account.role, email: account.email }))
        if (account.role === "provider" && account.application?.status === "Approved") billing.ensureProviderTrial(account.email)
      }
      const result = action ? await actions[action](...args) : null
      for (const [key, value] of Object.entries(storage.values)) {
        if (key === "soundstage-admin-account") continue
        if (originalValues.get(key) !== value) await tx`insert into soundstage.records (key,value) values (${key},${tx.json(JSON.parse(value))}) on conflict (key) do update set value=excluded.value, updated_at=now()`
      }
      for (const row of rows) if (!(row.key in storage.values)) await tx`delete from soundstage.records where key=${row.key}`
      return { records: visibleRecords(), session: { ...session.values }, result }
    })
  })
}
