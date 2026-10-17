import { appStorage, mutate } from "../data/app-store"
import { getAccount } from "../auth/client-auth"

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
  if (typeof window === "undefined") return { subscriptions: [], payments: [], audit: [] }
  return JSON.parse(appStorage.getItem(KEY) || '{"subscriptions":[],"payments":[],"audit":[]}')
}
const normalized = (email: string) => email.trim().toLowerCase()
export function getAuditEntries() { const role = getAccount()?.role; return role === "admin" || role === "payroll_master" ? read().audit : [] }

export function payDemoSubscription(planName: string, method: string) { return mutate<SubscriptionPayment>("payDemoSubscription", [planName, method]) }
export function ensureProviderTrial(email: string) {
  const state = read(); const existing = state.subscriptions.find(s => s.email === normalized(email))
  if (existing) return existing
  return { email: normalized(email), trialStart: new Date(0).toISOString(), trialEnd: new Date(0).toISOString() }
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
export function submitSubscriptionPayment(planName: string, method: string, reference: string) { return mutate<void>("submitSubscriptionPayment", [planName, method, reference]) }
export function reviewSubscriptionPayment(id: string, status: "Paid" | "Rejected") { return mutate<void>("reviewSubscriptionPayment", [id, status]) }
