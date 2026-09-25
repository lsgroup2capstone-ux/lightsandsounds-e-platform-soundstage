import { appStorage, mutate } from "./app-store"
import { getAccount, isProviderApproved } from "@/lib/client-auth"

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
}

const SERVICES_PREFIX = "soundstage-provider-services-v2:"

function accountKey() {
  const account = getAccount()
  return account?.role === "provider" ? `${SERVICES_PREFIX}${encodeURIComponent(account.email.trim().toLowerCase())}` : null
}

function readServices(key: string): ProviderService[] {
  const value = appStorage.getItem(key)
  if (!value) return []
  try { const services = JSON.parse(value); return Array.isArray(services) ? services : [] } catch { return [] }
}

export function getProviderServices(scope: "all" | "current" = "all"): ProviderService[] {
  if (typeof window === "undefined") return []
  const ownKey = accountKey()
  if (scope === "current") return ownKey ? readServices(ownKey) : []
  const services: ProviderService[] = []
  for (let index = 0; index < appStorage.length; index += 1) {
    const key = appStorage.key(index)
    if (key?.startsWith(SERVICES_PREFIX) && (getAccount()?.role === "admin" || isProviderApproved(decodeURIComponent(key.slice(SERVICES_PREFIX.length))))) services.push(...readServices(key))
  }
  return services
}

export function saveProviderService(service: ProviderService) { return mutate<void>("saveProviderService", [service]) }

export function updateProviderServices(services: ProviderService[]) { return mutate<void>("updateProviderServices", [services]) }
