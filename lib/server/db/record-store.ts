import type { Tx } from "../runtime"
import { RequestError } from "../request-error"
import { businessName, personName, userIdByEmail } from "./users"

// Bridges the screens' record keys and the 11 core tables (data dictionary Tables 3-13).
// Requests read the keys built from the tables; changed keys are written back as rows.
type Item = Record<string, unknown>
type Row = Record<string, unknown>
export const ACCOUNTS_KEY = "soundstage-accounts-v2"
export const SERVICES_PREFIX = "soundstage-provider-services-v2:"
export const MARKETPLACE_KEY = "soundstage-marketplace-v1"
export const MESSAGES_KEY = "soundstage-booking-messages-v1"
export const REPORTS_KEY = "soundstage-provider-reports-v1"
export const SCHEDULE_PREFIX = "soundstage-schedule:"
export const READS_PREFIX = "soundstage-event-notifications:"
// Request-scoped keys that are never stored.
export const TRANSIENT_KEYS = ["soundstage-admin-account", "soundstage-import-completed"]
const PLAN_PRICES: Record<string, number> = { Starter: 499, Pro: 999, Studio: 1999 }
const READ_RECEIPT = "read_receipt"

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value)
const optIso = (value: unknown) => value === null || value === undefined ? undefined : iso(value)
const str = (value: unknown) => typeof value === "string" ? value : value === null || value === undefined ? "" : String(value)
const opt = (value: unknown, max: number) => value === null || value === undefined || value === "" ? null : String(value).slice(0, max)
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const when = (value: unknown) => { const text = str(value); return text && Number.isFinite(Date.parse(text)) ? text : null }
const numericId = (value: unknown) => /^\d{1,18}$/.test(str(value))
const compact = (item: Item) => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined))
const manilaDate = (value: string | number | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value))
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
// A stored date means the whole day in Manila.
const dayStart = (value: unknown) => new Date(`${dateText(value)}T00:00:00+08:00`).toISOString()
const dayEnd = (value: unknown) => new Date(`${dateText(value)}T23:59:59.999+08:00`).toISOString()
const encodeOwner = (prefix: string, email: string) => prefix + encodeURIComponent(email.trim().toLowerCase())
const decodeOwner = (prefix: string, key: string) => decodeURIComponent(key.slice(prefix.length)).trim().toLowerCase()
function list(raw: string | undefined): Item[] {
  if (!raw) return []
  try { const value = JSON.parse(raw); return Array.isArray(value) ? value.filter(v => v && typeof v === "object" && !Array.isArray(v)) : [] } catch { return [] }
}
const extType = (key: string) => key.endsWith(".pdf") ? "application/pdf" : key.endsWith(".png") ? "image/png" : "image/jpeg"
const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

async function ownerId(tx: Tx, email: string) {
  const id = await userIdByEmail(tx, email)
  if (id === null) throw new RequestError("Account not found.", 404)
  return id
}

// Compares two lists by id and calls back for added, changed and removed items.
async function diff(before: Item[], after: Item[], id: (item: Item) => string, on: { add?: (item: Item, index: number) => Promise<unknown>; change?: (item: Item, old: Item) => Promise<unknown>; remove?: (item: Item) => Promise<unknown> }) {
  const old = new Map(before.map(item => [id(item), item]))
  const next = new Set(after.map(id))
  for (const [key, item] of old) if (!next.has(key) && on.remove) await on.remove(item)
  for (const [index, item] of after.entries()) {
    const previous = old.get(id(item))
    if (!previous) { if (on.add) await on.add(item, index) }
    else if (JSON.stringify(previous) !== JSON.stringify(item) && on.change) await on.change(item, previous)
  }
}

async function saveAccounts(tx: Tx, before: Item[], after: Item[]) {
  const upsert = async (a: Item) => {
    const role = str(a.role), provider = role === "provider"
    const app = provider && a.application && typeof a.application === "object" ? a.application as Item : null
    const docs = app && Array.isArray(app.documents) ? app.documents as Item[] : []
    await tx`insert into soundstage.users (email, role, first_name, last_name, phone_number, business_name, bio, profile_image, verification_status, verification_reason, business_permit, valid_id)
      values (${str(a.email).trim().toLowerCase()}, ${role}, ${str(a.firstName).slice(0, 100)}, ${str(a.lastName).slice(0, 100)}, ${opt(a.mobile, 20)}, ${opt(a.business, 200)}, ${opt(a.bio, 5000)},
        ${opt(a.profileImage, 2000)}, ${app ? str(app.status).toLowerCase() : null}, ${app ? opt(app.reason, 1000) : null}, ${opt(docs[0]?.key, 500)}, ${opt(docs[1]?.key, 500)})
      on conflict (email) do update set role = excluded.role, first_name = excluded.first_name, last_name = excluded.last_name, phone_number = excluded.phone_number,
        business_name = excluded.business_name, bio = excluded.bio, profile_image = excluded.profile_image, verification_status = excluded.verification_status,
        verification_reason = excluded.verification_reason, business_permit = excluded.business_permit, valid_id = excluded.valid_id, updated_at = now()`
  }
  // Users are never deleted here: bookings, payments and the audit log keep referring to them.
  // An account that should stop working is set to status 'deactivated' instead.
  await diff(before, after, a => str(a.email).trim().toLowerCase(), { add: upsert, change: upsert })
}

async function saveServices(tx: Tx, email: string, before: Item[], after: Item[]) {
  const provider = await ownerId(tx, email)
  const fields = (s: Item) => [str(s.name).slice(0, 100), str(s.description), num(s.price), opt(s.category, 50), str(s.location).slice(0, 200), str(s.coverageAreas || s.location), num(s.transportationFee), opt(s.image, 2000), s.active === true] as const
  const insert = (s: Item) => { const [name, description, price, category, location, areas, fee, image, active] = fields(s)
    return tx`insert into soundstage.service_packages (provider_id, name, description, price, category, location, coverage_areas, transportation_fee, image, is_active)
      values (${provider}, ${name}, ${description}, ${price}, ${category}, ${location}, ${areas}, ${fee}, ${image}, ${active})` }
  // Ids the browser invents for new packages are replaced by the table's package_id.
  await diff(before, after, s => str(s.id), {
    add: s => numericId(s.id) ? tx`select 1` : insert(s),
    change: s => { const [name, description, price, category, location, areas, fee, image, active] = fields(s)
      return tx`update soundstage.service_packages set name = ${name}, description = ${description}, price = ${price}, category = ${category}, location = ${location},
        coverage_areas = ${areas}, transportation_fee = ${fee}, image = ${image}, is_active = ${active}, updated_at = now() where package_id = ${str(s.id)} and provider_id = ${provider}` },
    remove: s => numericId(s.id) ? tx`delete from soundstage.service_packages where package_id = ${str(s.id)} and provider_id = ${provider}` : tx`select 1`,
  })
  // A numeric id that was not in the list before is an existing package the provider re-sent; update it.
  for (const s of after) if (numericId(s.id) && !before.some(b => str(b.id) === str(s.id))) {
    const [name, description, price, category, location, areas, fee, image, active] = fields(s)
    const updated = await tx`update soundstage.service_packages set name = ${name}, description = ${description}, price = ${price}, category = ${category}, location = ${location},
      coverage_areas = ${areas}, transportation_fee = ${fee}, image = ${image}, is_active = ${active}, updated_at = now() where package_id = ${str(s.id)} and provider_id = ${provider} returning package_id`
    if (!updated.length) await insert(s)
  }
}

async function saveSubscriptions(tx: Tx, before: Item[], after: Item[]) {
  const today = manilaDate(Date.now())
  const activate = async (s: Item) => {
    if (!when(s.paidUntil)) return
    const provider = await ownerId(tx, str(s.email))
    const plan = PLAN_PRICES[str(s.plan)] !== undefined ? str(s.plan) : "Starter", end = manilaDate(str(s.paidUntil))
    // A plan waiting for its payment becomes the active one; otherwise a new period is added.
    const [pending] = await tx<{ subscription_id: string }[]>`select subscription_id from soundstage.subscriptions where provider_id = ${provider} and plan_type = ${plan} and status = 'pending' order by subscription_id desc limit 1`
    if (pending) await tx`update soundstage.subscriptions set status = 'active', start_date = least(${today}::date, ${end}::date), end_date = ${end}::date where subscription_id = ${pending.subscription_id}`
    else await tx`insert into soundstage.subscriptions (provider_id, plan_type, price, start_date, end_date, status) values (${provider}, ${plan}, ${PLAN_PRICES[plan]}, least(${today}::date, ${end}::date), ${end}::date, 'active')`
  }
  await diff(before, after, s => str(s.email).trim().toLowerCase(), {
    add: async s => {
      const provider = await ownerId(tx, str(s.email))
      const start = manilaDate(when(s.trialStart) || Date.now()), end = manilaDate(when(s.trialEnd) || Date.now())
      await tx`insert into soundstage.subscriptions (provider_id, plan_type, price, start_date, end_date, status)
        values (${provider}, 'Trial', 0, least(${start}::date, ${end}::date), ${end}::date, case when ${end}::date < ${today}::date then 'expired' else 'trial' end)`
      await activate(s)
    },
    change: async (s, old) => { if (s.paidUntil !== old.paidUntil || s.plan !== old.plan) await activate(s) },
  })
}

async function saveSubscriptionPayments(tx: Tx, before: Item[], after: Item[]) {
  const status = (s: unknown) => s === "Paid" ? "paid" : s === "Rejected" ? "failed" : "pending"
  await diff(before, after, p => str(p.id), {
    add: async p => {
      const provider = await ownerId(tx, str(p.email))
      const plan = PLAN_PRICES[str(p.plan)] !== undefined ? str(p.plan) : "Starter", today = manilaDate(Date.now())
      let subscription: string | undefined
      if (p.status === "Pending") {
        // The plan waits as 'pending' until the payroll master verifies the payment.
        const [row] = await tx<{ subscription_id: string }[]>`insert into soundstage.subscriptions (provider_id, plan_type, price, start_date, end_date, status)
          values (${provider}, ${plan}, ${num(p.amount)}, ${today}::date, ${today}::date, 'pending') returning subscription_id`
        subscription = row.subscription_id
      } else {
        const [row] = await tx<{ subscription_id: string }[]>`select subscription_id from soundstage.subscriptions where provider_id = ${provider}
          order by (plan_type = ${plan}) desc, subscription_id desc limit 1`
        subscription = row?.subscription_id
      }
      if (!subscription) throw new RequestError("Provider subscription was not found.")
      await tx`insert into soundstage.payments (subscription_id, user_id, amount, payment_type, payment_method, payment_status, reference_number, paid_at, created_at)
        values (${subscription}, ${provider}, ${num(p.amount)}, 'subscription', ${opt(p.method, 50)}, ${status(p.status)}, ${opt(p.reference, 100)}, ${when(p.paidAt)}, ${when(p.createdAt) || new Date().toISOString()})`
    },
    change: async (p, old) => {
      if (!numericId(p.id) || p.status === old.status) return
      const [row] = await tx<{ subscription_id: string }[]>`update soundstage.payments set payment_status = ${status(p.status)}, paid_at = ${when(p.paidAt)},
        review_reason = ${p.status === "Rejected" ? "Rejected by the payroll master" : null}, updated_at = now() where payment_id = ${str(p.id)} returning subscription_id`
      if (row && p.status === "Rejected") await tx`update soundstage.subscriptions set status = 'cancelled' where subscription_id = ${row.subscription_id} and status = 'pending'`
    },
  })
}

// Activity entries become append-only audit_log rows; the actor is matched by the email in the entry.
async function saveAudit(tx: Tx, before: Item[], after: Item[]) {
  const added = after.filter(a => !numericId(a.id) && !before.some(b => str(b.id) === str(a.id)))
  for (const a of added.reverse()) {
    const actor = str(a.actor), email = /\(([^()\s]+@[^()\s]+)\)/.exec(actor)?.[1]?.toLowerCase()
    const [user] = email ? await tx<{ user_id: string; role: string }[]>`select user_id, role from soundstage.users where email = ${email}` : []
    await tx`insert into soundstage.audit_log (user_id, actor_role, action, table_name, record_id, old_value, new_value, created_at)
      values (${user?.user_id ?? null}, ${user?.role ?? "system"}, ${str(a.action).slice(0, 100) || "Activity"}, 'activity', ${str(a.target).slice(0, 100) || "-"}, ${opt(a.before, 5000)}, ${opt(a.after, 5000)}, ${when(a.at) || new Date().toISOString()})`
  }
}

async function saveMessages(tx: Tx, before: Item[], after: Item[]) {
  await diff(before, after, m => str(m.id), {
    add: async m => {
      if (numericId(m.id)) return
      // The sender is the booking's client or provider, decided by the server-checked role.
      const [booking] = await tx<{ client_id: string; provider_id: string }[]>`select client_id, provider_id from soundstage.bookings where booking_id = ${str(m.bookingId)}`
      if (!booking) throw new RequestError("Booking not found.", 404)
      const sender = m.senderRole === "provider" ? booking.provider_id : booking.client_id
      await tx`insert into soundstage.messages (booking_id, sender_id, body, created_at) values (${str(m.bookingId)}, ${sender}, ${str(m.body)}, ${when(m.createdAt) || new Date().toISOString()})`
    },
  })
}

// One report per booking, kept on the booking row.
async function saveReports(tx: Tx, before: Item[], after: Item[]) {
  await diff(before, after, r => str(r.id), {
    add: async r => {
      const updated = await tx`update soundstage.bookings set report_reason = ${str(r.reason).slice(0, 500)}, report_details = ${str(r.details)}, report_status = 'pending',
        reported_at = ${when(r.createdAt) || new Date().toISOString()}, updated_at = now() where booking_id = ${str(r.bookingId)} and report_status is null returning booking_id`
      if (!updated.length) throw new RequestError("A report was already submitted for this booking.", 409)
    },
    change: r => tx`update soundstage.bookings set report_status = ${r.status === "Resolved" ? "resolved" : "pending"}, updated_at = now() where booking_id = ${str(r.bookingId)}`,
  })
}

async function syncKey(tx: Tx, key: string, before: string | undefined, after: string | undefined) {
  if (key === ACCOUNTS_KEY) return saveAccounts(tx, list(before), list(after))
  if (key.startsWith(SERVICES_PREFIX)) return saveServices(tx, decodeOwner(SERVICES_PREFIX, key), list(before), list(after))
  if (key === MESSAGES_KEY) return saveMessages(tx, list(before), list(after))
  if (key === REPORTS_KEY) return saveReports(tx, list(before), list(after))
  if (key === MARKETPLACE_KEY) {
    const parse = (raw: string | undefined) => { try { const v = raw ? JSON.parse(raw) : {}; return { s: list(JSON.stringify(v.subscriptions || [])), p: list(JSON.stringify(v.payments || [])), a: list(JSON.stringify(v.audit || [])) } } catch { return { s: [], p: [], a: [] } } }
    const old = parse(before), next = parse(after)
    await saveSubscriptions(tx, old.s, next.s)
    await saveSubscriptionPayments(tx, old.p, next.p)
    return saveAudit(tx, old.a, next.a)
  }
  if (key.startsWith(READS_PREFIX)) {
    const rest = key.slice(READS_PREFIX.length), email = rest.slice(rest.indexOf(":") + 1)
    const user = await ownerId(tx, email)
    const ids = [...new Set(after ? (JSON.parse(after) as unknown[]).filter(id => typeof id === "string").map(id => (id as string).slice(0, 200)) : [])]
    await tx`delete from soundstage.notifications where user_id = ${user} and type = ${READ_RECEIPT}`
    for (const id of ids) await tx`insert into soundstage.notifications (user_id, type, title, is_read) values (${user}, ${READ_RECEIPT}, ${id}, true)`
    return
  }
  if (key.startsWith(SCHEDULE_PREFIX)) {
    // Weekly working days are untouched; the key carries only blocked dates (restore path).
    const provider = await ownerId(tx, decodeOwner(SCHEDULE_PREFIX, key))
    const days = new Set(after ? (JSON.parse(after) as unknown[]).filter(d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) as string[] : [])
    const current = await tx<{ day: string }[]>`select to_char(available_date, 'YYYY-MM-DD') as day from soundstage.schedules where provider_id = ${provider} and available_date is not null and not is_available`
    for (const { day } of current) if (!days.has(day)) await tx`delete from soundstage.schedules where provider_id = ${provider} and available_date = ${day}::date`
    for (const day of days) if (!current.some(c => c.day === day)) await tx`insert into soundstage.schedules (provider_id, available_date, is_available) values (${provider}, ${day}::date, false)`
    return
  }
  if (key.startsWith("soundstage-client-bookings-v3:")) throw new Error("Booking records are read-only.")
  if (key === "soundstage-withdrawals-v1") throw new RequestError("Withdrawal requests are replaced by payouts released by the payroll master.", 410)
  throw new Error("Unsupported record key: " + key.slice(0, 80))
}

/** Writes every changed key to its table, in the caller's transaction. */
export async function saveRecords(tx: Tx, before: Record<string, string>, after: Record<string, string>) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  // Users first: every other row references them.
  for (const key of [...keys].sort((a, b) => Number(b === ACCOUNTS_KEY) - Number(a === ACCOUNTS_KEY))) {
    if (TRANSIENT_KEYS.includes(key) || before[key] === after[key]) continue
    await syncKey(tx, key, before[key], after[key])
  }
}

/** Builds the screens' record keys from the tables; empty collections are omitted. */
export async function loadRecords(tx: Tx): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const put = (key: string, value: unknown[]) => { if (value.length) out[key] = JSON.stringify(value) }
  const today = manilaDate(Date.now())
  // Periods that ended are marked expired before they are shown.
  await tx`update soundstage.subscriptions set status = 'expired' where status in ('trial', 'active') and end_date < ${today}::date`
  const [users, applicationDates, packages, subscriptions, subPayments, audit, messages, reports, reads, blocked] = await Promise.all([
    tx<Row[]>`select * from soundstage.users order by user_id`,
    tx<Row[]>`select record_id, action, max(created_at) as at from soundstage.audit_log where action in ('Provider application submitted', 'Provider application reviewed') group by record_id, action`,
    tx<Row[]>`select p.*, (select count(*)::int from soundstage.bookings b where b.package_id = p.package_id) as booking_count from soundstage.service_packages p order by p.provider_id, p.package_id desc`,
    tx<Row[]>`select * from soundstage.subscriptions order by provider_id, subscription_id`,
    tx<Row[]>`select p.*, s.plan_type from soundstage.payments p join soundstage.subscriptions s on s.subscription_id = p.subscription_id
      where p.subscription_id is not null and (p.checkout_session_id is null or p.payment_status = 'paid') order by p.payment_id desc`,
    tx<Row[]>`select * from soundstage.audit_log order by audit_id desc`,
    tx<Row[]>`select m.*, b.client_id, b.provider_id from soundstage.messages m join soundstage.bookings b on b.booking_id = m.booking_id order by m.message_id`,
    tx<Row[]>`select booking_id, client_id, provider_id, report_reason, report_details, report_status, reported_at from soundstage.bookings where report_status is not null order by reported_at desc`,
    tx<Row[]>`select user_id, title from soundstage.notifications where type = ${READ_RECEIPT} order by notification_id`,
    tx<Row[]>`select provider_id, to_char(available_date, 'YYYY-MM-DD') as day from soundstage.schedules where available_date is not null and not is_available order by provider_id, available_date`,
  ])
  const byId = new Map(users.map(u => [str(u.user_id), u]))
  const email = (id: unknown) => str(byId.get(str(id))?.email)
  const person = (id: unknown) => { const u = byId.get(str(id)); return u ? personName(u as { email: string }) : "" }
  const business = (id: unknown) => { const u = byId.get(str(id)); return u ? businessName(u as { email: string }) : "" }
  const appDate = (target: string, action: string) => applicationDates.find(r => r.record_id === target && r.action === action)?.at
  put(ACCOUNTS_KEY, users.map(u => {
    const status = str(u.verification_status), mail = str(u.email)
    const documents = [[u.business_permit, "Business permit"], [u.valid_id, "Valid ID"]].filter(([key]) => key).map(([key, label]) => ({ name: `${label}.${str(key).split(".").pop()}`, type: extType(str(key)), key: str(key), size: 1 }))
    return compact({ firstName: str(u.first_name), lastName: str(u.last_name), email: mail, mobile: str(u.phone_number), role: str(u.role), authMethod: "email",
      business: u.business_name ?? undefined, bio: u.bio ?? undefined, profileImage: u.profile_image ?? undefined,
      application: u.role === "provider" && status ? compact({ status: capital(status), documents, submittedAt: iso(appDate(mail, "Provider application submitted") || u.updated_at),
        reviewedAt: status !== "pending" ? optIso(appDate(mail, "Provider application reviewed")) : undefined, reason: u.verification_reason ?? undefined }) : undefined })
  }))
  const byProvider = new Map<string, Item[]>()
  for (const p of packages) byProvider.set(str(p.provider_id), [...(byProvider.get(str(p.provider_id)) || []), compact({ id: str(p.package_id), name: str(p.name), location: str(p.location),
    coverageAreas: str(p.coverage_areas), transportationFee: num(p.transportation_fee), description: str(p.description), price: num(p.price), image: str(p.image), providerName: business(p.provider_id),
    active: p.is_active === true, bookings: num(p.booking_count), category: p.category ?? undefined })])
  for (const [provider, items] of byProvider) put(encodeOwner(SERVICES_PREFIX, email(provider)), items)
  const subsByProvider = new Map<string, Row[]>()
  for (const s of subscriptions) subsByProvider.set(str(s.provider_id), [...(subsByProvider.get(str(s.provider_id)) || []), s])
  const billing = {
    subscriptions: [...subsByProvider].map(([provider, rows]) => {
      const trial = rows.filter(r => r.plan_type === "Trial").pop()
      const paid = rows.filter(r => r.plan_type !== "Trial" && (r.status === "active" || r.status === "expired")).sort((a, b) => dateText(a.end_date).localeCompare(dateText(b.end_date))).pop()
      const first = trial || rows[0]
      return compact({ email: email(provider), trialStart: dayStart(first.start_date), trialEnd: trial ? dayEnd(trial.end_date) : dayStart(first.start_date),
        plan: paid ? str(paid.plan_type) : undefined, paidUntil: paid ? dayEnd(paid.end_date) : undefined })
    }),
    payments: subPayments.map(p => compact({ id: str(p.payment_id), email: email(p.user_id), customer: business(p.user_id), plan: str(p.plan_type), amount: num(p.amount),
      method: str(p.payment_method), reference: str(p.reference_number), status: p.payment_status === "paid" ? "Paid" : p.payment_status === "failed" || p.payment_status === "expired" ? "Rejected" : "Pending",
      createdAt: iso(p.created_at), paidAt: optIso(p.paid_at), invoice: p.payment_status === "paid" ? `SI-${str(p.payment_id)}` : undefined })),
    audit: audit.map(a => {
      const u = a.user_id ? byId.get(str(a.user_id)) : undefined
      const actor = u ? `${str(a.actor_role)}: ${personName(u as { email: string })} (${str(u.email)})` : str(a.reason).replace(/^Recorded by /, "") || "system"
      return { id: str(a.audit_id), actor, action: str(a.action), target: str(a.record_id), before: str(a.old_value), after: str(a.new_value), at: iso(a.created_at) }
    }),
  }
  if (billing.subscriptions.length || billing.payments.length || billing.audit.length) out[MARKETPLACE_KEY] = JSON.stringify(billing)
  put(MESSAGES_KEY, messages.map(m => ({ id: str(m.message_id), bookingId: str(m.booking_id), client: person(m.client_id), provider: business(m.provider_id),
    senderRole: str(m.sender_id) === str(m.provider_id) ? "provider" : "client", senderName: str(m.sender_id) === str(m.provider_id) ? business(m.provider_id) : person(m.client_id),
    body: str(m.body), createdAt: iso(m.created_at) })))
  put(REPORTS_KEY, reports.map(r => ({ id: `RPT-${str(r.booking_id)}`, bookingId: str(r.booking_id), client: person(r.client_id), clientEmail: email(r.client_id), provider: business(r.provider_id),
    reason: str(r.report_reason), details: str(r.report_details), status: r.report_status === "resolved" ? "Resolved" : "Pending", createdAt: iso(r.reported_at) })))
  const readKeys = new Map<string, string[]>()
  for (const r of reads) { const u = byId.get(str(r.user_id)); if (!u) continue; const key = `${READS_PREFIX}${str(u.role)}:${str(u.email)}`; readKeys.set(key, [...(readKeys.get(key) || []), str(r.title)]) }
  for (const [key, ids] of readKeys) put(key, ids)
  const schedules = new Map<string, string[]>()
  for (const r of blocked) schedules.set(str(r.provider_id), [...(schedules.get(str(r.provider_id)) || []), str(r.day)])
  for (const [provider, days] of schedules) put(encodeOwner(SCHEDULE_PREFIX, email(provider)), days)
  return out
}
