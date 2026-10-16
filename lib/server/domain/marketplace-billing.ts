import { storage, session, events } from "../runtime"
import { getAccount } from "./client-auth"

export const MARKETPLACE_EVENT = "soundstage-marketplace-updated"
const KEY = "soundstage-marketplace-v1"
const DAY = 86400000
export const plans = [
  { name: "Starter", amount: 499, description: "For new providers", features: ["5 active packages", "Basic analytics", "Marketplace listing"] },
  { name: "Pro", amount: 999, description: "Best for growing teams", features: ["Unlimited packages", "Priority placement", "Advanced analytics"] },
  { name: "Studio", amount: 1999, description: "For production houses", features: ["Multiple team members", "Featured placement", "Dedicated support"] },
] as const
export type AuditEntry = { id: string; actor: string; action: string; target: string; before: string; after: string; at: string }
export type Subscription = { email: string; trialStart: string; trialEnd: string; plan?: string; paidUntil?: string }
export type SubscriptionPayment = { id: string; email: string; customer: string; plan: string; amount: number; method: string; reference: string; status: "Pending" | "Paid" | "Rejected"; createdAt: string; paidAt?: string; invoice?: string }
type State = { subscriptions: Subscription[]; payments: SubscriptionPayment[]; audit: AuditEntry[] }
function read(): State {
  if (typeof events === "undefined") return { subscriptions: [], payments: [], audit: [] }
  return JSON.parse(storage.getItem(KEY) || '{"subscriptions":[],"payments":[],"audit":[]}')
}
function write(state: State) { storage.setItem(KEY, JSON.stringify(state)); events.dispatchEvent(new Event(MARKETPLACE_EVENT)) }
const normalized = (email: string) => email.trim().toLowerCase()
function entry(action: string, target: string, before: string, after: string): AuditEntry {
  const actor = getAccount()
  if (actor?.role !== "admin" && actor?.role !== "payroll_master") throw new Error("Administrator or payroll master access required.")
  return { id: crypto.randomUUID(), actor: `${actor.firstName} ${actor.lastName} (${actor.email})`, action, target, before, after, at: new Date().toISOString() }
}
export function recordAdminAction(action: string, target: string, before: string, after: string) {
  if (before === after) return
  const state = read(); state.audit.unshift(entry(action, target, before, after)); write(state)
}
export function getAuditEntries() { const role = getAccount()?.role; return role === "admin" || role === "payroll_master" ? read().audit : [] }
export function recordMarketplaceAction(action: string, target: string, before: string, after: string) {
  const actor = getAccount()
  if (!actor || before === after) return
  const state = read()
  state.audit.unshift({ id: crypto.randomUUID(), actor: `${actor.role}: ${actor.firstName} ${actor.lastName} (${actor.email})`, action, target, before, after, at: new Date().toISOString() })
  write(state)
}

export function payDemoSubscription(planName: string, method: string) {
  const actor = getAccount(); const plan = plans.find(p => p.name === planName)
  if (actor?.role !== "provider" || !plan) throw new Error("Sign in as a provider and select a plan.")
  if (!["GCash", "Maya", "Credit / Debit card"].includes(method)) throw new Error("Select a payment method.")
  ensureProviderTrial(actor.email)
  const state = read()
  if (state.payments.some(p => p.email === normalized(actor.email) && p.status === "Pending")) throw new Error("Your existing payment is awaiting verification.")
  const subscription = state.subscriptions.find(s => s.email === normalized(actor.email))!
  const at = new Date().toISOString(); const id = crypto.randomUUID()
  const payment: SubscriptionPayment = { id, email: normalized(actor.email), customer: actor.business || `${actor.firstName} ${actor.lastName}`, plan: plan.name, amount: plan.amount, method, reference: `DEMO-${id}`, status: "Paid", createdAt: at, paidAt: at, invoice: `SI-${id}` }
  subscription.plan = plan.name
  subscription.paidUntil = new Date(Math.max(Date.now(), Date.parse(subscription.paidUntil || subscription.trialEnd)) + 30 * DAY).toISOString()
  state.payments.unshift(payment)
  state.audit.unshift({ id: crypto.randomUUID(), actor: `provider: ${actor.email}`, action: "Demo subscription payment", target: id, before: "Unpaid", after: `Paid ${plan.amount} PHP via ${method}; ${payment.invoice}`, at })
  write(state)
  return payment
}
export function ensureProviderTrial(email: string) {
  const state = read(); const existing = state.subscriptions.find(s => s.email === normalized(email))
  if (existing) return existing
  const now = Date.now()
  const subscription = { email: normalized(email), trialStart: new Date(now).toISOString(), trialEnd: new Date(now + 7 * DAY).toISOString() }
  state.subscriptions.push(subscription); write(state); return subscription
}
export function getProviderSubscription(email: string) { return read().subscriptions.find(s => s.email === normalized(email)) }
export function subscriptionStatus(subscription: Subscription, now = Date.now()) {
  if (subscription.paidUntil && Date.parse(subscription.paidUntil) > now) return "Active"
  return Date.parse(subscription.trialEnd) > now ? "Trial" : "Expired"
}
export function getSubscriptionPayments() {
  const actor = getAccount()
  return read().payments.filter(p => actor?.role === "admin" || actor?.role === "payroll_master" || (actor?.role === "provider" && p.email === normalized(actor.email)))
}
export function submitSubscriptionPayment(planName: string, method: string, reference: string) {
  const actor = getAccount(); const plan = plans.find(p => p.name === planName)
  if (actor?.role !== "provider" || !plan) throw new Error("Sign in as a provider and select a plan.")
  if (!["GCash", "Bank transfer"].includes(method) || reference.trim().length < 6) throw new Error("Enter a valid payment method and reference (at least 6 characters).")
  ensureProviderTrial(actor.email)
  const state = read()
  if (state.payments.some(p => p.email === normalized(actor.email) && p.status === "Pending")) throw new Error("A payment is already awaiting verification.")
  if (state.payments.some(p => p.method === method && p.reference.toLowerCase() === reference.trim().toLowerCase() && p.status !== "Rejected")) throw new Error("This payment reference has already been submitted.")
  const payment: SubscriptionPayment = { id: crypto.randomUUID(), email: normalized(actor.email), customer: actor.business || `${actor.firstName} ${actor.lastName}`, plan: plan.name, amount: plan.amount, method, reference: reference.trim(), status: "Pending", createdAt: new Date().toISOString() }
  state.payments.unshift(payment); write(state)
  recordMarketplaceAction("Subscription payment submitted", payment.id, "New", `Pending: ${payment.amount} PHP via ${payment.method}`)
}
export function reviewSubscriptionPayment(id: string, status: "Paid" | "Rejected") {
  const state = read(); const payment = state.payments.find(p => p.id === id)
  if (!payment || payment.status !== "Pending") throw new Error("Payment is no longer pending.")
  const audit = entry("Subscription payment reviewed", id, "Pending", status)
  if (status === "Paid") {
    const subscription = state.subscriptions.find(s => s.email === payment.email)
    if (!subscription) throw new Error("Provider subscription was not found.")
    const start = Math.max(Date.now(), Date.parse(subscription.paidUntil || subscription.trialEnd))
    subscription.plan = payment.plan; subscription.paidUntil = new Date(start + 30 * DAY).toISOString()
    payment.paidAt = audit.at; payment.invoice = `SI-${payment.id}`
  }
  payment.status = status; state.audit.unshift(audit); write(state)
}
export function migrateProviderBilling(oldEmail: string, newEmail: string) {
  const state = read()
  state.subscriptions.forEach(s => { if (s.email === normalized(oldEmail)) s.email = normalized(newEmail) })
  state.payments.forEach(p => { if (p.email === normalized(oldEmail)) p.email = normalized(newEmail) })
  write(state)
}
