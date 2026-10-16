import { appStorage, mutate } from "./app-store"
import { getAccount, getApprovedProviders, isProviderApproved, type ClientAccount } from "@/lib/client-auth"
import type { Location, ServiceCategory, ServicePackage } from "@/lib/mock-data"

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
  category?: ServiceCategory
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

export function serviceCategory(service: Pick<ProviderService, "category">): ServiceCategory {
  return service.category ?? "Full Production"
}

export function providerSlug(name: string) { return encodeURIComponent(name.trim()) }

export type ProviderProfile = {
  id: string
  name: string
  location: string
  coverageAreas: string
  bio: string
  image: string
  services: ProviderService[]
  minPrice: number
}

export type ProviderCategoryFilter = "All" | ServiceCategory
export type ProviderPriceFilter = "Any price" | "Under PHP 15,000" | "PHP 15,000-30,000" | "Over PHP 30,000"
export type ProviderSortKey = "recommended" | "price-asc" | "price-desc"

type ProviderAccount = Pick<ClientAccount, "firstName" | "lastName" | "business" | "bio" | "profileImage">

export function providerDisplayName(account: ProviderAccount) {
  return (account.business || `${account.firstName} ${account.lastName}`).trim()
}

export function groupProviders(services: ProviderService[], accounts: ProviderAccount[] = []): ProviderProfile[] {
  const providers = new Map<string, ProviderProfile>()
  const accountBios = new Map(accounts.map((account) => [providerDisplayName(account), account.bio || ""]))
  const accountLogos = new Map(accounts.map((account) => [providerDisplayName(account), account.profileImage || ""]))
  for (const service of services) {
    if (!service.active) continue
    const name = service.providerName.trim()
    const existing = providers.get(name)
    if (existing) {
      existing.services.push(service)
      existing.minPrice = Math.min(existing.minPrice, service.price)
    } else {
      providers.set(name, { id: providerSlug(name), name, location: service.location, coverageAreas: service.coverageAreas || service.location, bio: accountBios.get(name) ?? "", image: accountLogos.get(name) || service.image, services: [service], minPrice: service.price })
    }
  }
  for (const account of accounts) {
    const name = providerDisplayName(account)
    if (!name || providers.has(name)) continue
    providers.set(name, { id: providerSlug(name), name, location: "", coverageAreas: "", bio: account.bio || "", image: account.profileImage || "", services: [], minPrice: Infinity })
  }
  return [...providers.values()]
}

export function getPublicProviders() {
  return groupProviders(getProviderServices(), getApprovedProviders())
}

function serviceMatchesPrice(service: ProviderService, price: ProviderPriceFilter) {
  if (price === "Under PHP 15,000") return service.price < 15000
  if (price === "PHP 15,000-30,000") return service.price >= 15000 && service.price <= 30000
  if (price === "Over PHP 30,000") return service.price > 30000
  return true
}

export function filterProviders(
  providers: ProviderProfile[],
  query: string,
  category: ProviderCategoryFilter,
  price: ProviderPriceFilter,
) {
  const normalizedQuery = query.trim().toLowerCase()
  const hasServiceFilter = category !== "All" || price !== "Any price"

  return providers.filter((provider) => {
    const searchable = `${provider.name} ${provider.location} ${provider.services.map((service) => service.name).join(" ")}`.toLowerCase()
    if (normalizedQuery && !searchable.includes(normalizedQuery)) return false
    if (!hasServiceFilter) return true

    return provider.services.some((service) => (
      (category === "All" || serviceCategory(service) === category)
      && serviceMatchesPrice(service, price)
    ))
  })
}

export function sortProviders(providers: ProviderProfile[], sort: ProviderSortKey) {
  if (sort === "recommended") return [...providers]

  const direction = sort === "price-asc" ? 1 : -1
  return providers.toSorted((a, b) => {
    const aHasPrice = Number.isFinite(a.minPrice)
    const bHasPrice = Number.isFinite(b.minPrice)
    if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1
    if (!aHasPrice) return 0
    return (a.minPrice - b.minPrice) * direction
  })
}

export function toServicePackage(service: ProviderService): ServicePackage {
  return {
    id: service.id,
    name: service.name,
    provider: { id: providerSlug(service.providerName), name: service.providerName, location: service.location as Location, rating: 0, reviews: 0, verified: false, since: new Date().getFullYear(), bio: service.description },
    category: serviceCategory(service),
    location: service.location as Location,
    price: service.price,
    image: service.image,
    rating: 0,
    reviews: 0,
    premium: false,
    tagline: service.description,
    inclusions: [],
    capacity: "Contact provider for capacity",
    coverageAreas: service.coverageAreas || service.location,
    transportationFee: service.transportationFee || 0,
  }
}
