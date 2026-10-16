import { storage, session, events } from "../runtime"
import { getAccount, isProviderApproved } from "./client-auth"
import { ensureProviderTrial, subscriptionStatus, recordMarketplaceAction } from "./marketplace-billing"

export type ProviderService = {
  id: string
  name: string
  location: string
  coverageAreas: string
  transportationFee: number
  description: string
  price: number
  image: string
  providerName: string
  active: boolean
  bookings: number
  category?: "Sound System" | "Lighting" | "Full Production" | "Band & Stage"
}

const SERVICES_PREFIX = "soundstage-provider-services-v2:"

function accountKey() {
  const account = getAccount()
  return account?.role === "provider" ? `${SERVICES_PREFIX}${encodeURIComponent(account.email.trim().toLowerCase())}` : null
}

function readServices(key: string): ProviderService[] {
  const value = storage.getItem(key)
  if (!value) return []
  try { const services = JSON.parse(value); return Array.isArray(services) ? services : [] } catch { return [] }
}

export function getProviderServices(scope: "all" | "current" = "all"): ProviderService[] {
  if (typeof events === "undefined") return []
  const ownKey = accountKey()
  if (scope === "current") return ownKey ? readServices(ownKey) : []
  const services: ProviderService[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(SERVICES_PREFIX) && (getAccount()?.role === "admin" || isProviderApproved(decodeURIComponent(key.slice(SERVICES_PREFIX.length))))) services.push(...readServices(key))
  }
  return services
}

export function saveProviderService(service: ProviderService) {
  const key = accountKey()
  if (!key) return
  const account = getAccount()!
  if (!isProviderApproved(account.email)) throw new Error("Administrator approval is required before publishing services.")
  if (subscriptionStatus(ensureProviderTrial(account.email)) === "Expired") throw new Error("Your trial has expired. Open Subscription and complete payment to add services.")
  const services = getProviderServices("current")
  storage.setItem(key, JSON.stringify([service, ...services]))
  recordMarketplaceAction("Service published", service.id, "New", service.name)
  events.dispatchEvent(new Event("soundstage-services-updated"))
}

export function updateProviderServices(services: ProviderService[]) {
  const account = getAccount()
  if (!account || !isProviderApproved(account.email)) throw new Error("Administrator approval is required before publishing services.")
  const key = accountKey()
  if (!key) return
  const previous = readServices(key)
  storage.setItem(key, JSON.stringify(services))
  for (const service of services) { const old = previous.find(item => item.id === service.id); if (JSON.stringify(old) !== JSON.stringify(service)) recordMarketplaceAction("Service updated", service.id, old ? `${old.name}; active: ${old.active}; price: ${old.price}` : "New", `${service.name}; active: ${service.active}; price: ${service.price}`) }
  for (const old of previous) if (!services.some(item => item.id === old.id)) recordMarketplaceAction("Service removed", old.id, old.name, "Removed")
  events.dispatchEvent(new Event("soundstage-services-updated"))
}
