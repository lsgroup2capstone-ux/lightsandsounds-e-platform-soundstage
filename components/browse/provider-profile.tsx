"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MapPin } from "lucide-react"
import { PackageCard } from "@/components/site/package-card"
import { summarize, type ServiceRatings } from "@/lib/service-ratings"
import { getServiceRatings } from "@/lib/service-ratings-store"
import { type ServiceCategory, categories } from "@/lib/mock-data"
import { getPublicProviders, serviceCategory, toServicePackage, type ProviderProfile as Profile } from "@/lib/provider-services"

const priceBands = [
  { label: "Any price", value: "any" },
  { label: "Under ₱15,000", value: "0-15000" },
  { label: "₱15,000 - ₱30,000", value: "15000-30000" },
  { label: "Over ₱30,000", value: "30000-999999" },
] as const

const selectClass = "h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"

export function ProviderProfile({ id }: { id: string }) {
  const [provider, setProvider] = useState<Profile | null | undefined>(undefined)
  const [ratings, setRatings] = useState<ServiceRatings>({})
  const [category, setCategory] = useState<ServiceCategory | "all">("all")
  const [band, setBand] = useState<(typeof priceBands)[number]["value"]>("any")

  useEffect(() => {
    const load = () => { setProvider(getPublicProviders().find((p) => p.id === id) ?? null); setRatings(getServiceRatings()) }
    load()
    window.addEventListener("soundstage-services-updated", load)
    return () => window.removeEventListener("soundstage-services-updated", load)
  }, [id])

  const services = useMemo(() => {
    if (!provider) return []
    const [min, max] = band === "any" ? [0, Infinity] : band.split("-").map(Number)
    return provider.services.filter((s) => (category === "all" || serviceCategory(s) === category) && s.price >= min && s.price <= max)
  }, [provider, category, band])

  const back = (
    <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft width={15} height={15} />
      Back to browse
    </Link>
  )

  if (provider === undefined) return <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">{back}</div>

  if (provider === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {back}
        <div className="mt-6 rounded-lg bg-card py-20 text-center shadow-soft">
          <p className="font-medium text-foreground">Provider not found</p>
          <p className="mt-1 text-sm text-muted-foreground">This provider does not exist or is not verified yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="bg-card">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
          {back}
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight">{provider.name}</h1>
          {provider.location && (
            <p className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin width={14} height={14} className="text-primary" />
              {provider.location}
            </p>
          )}
          {provider.coverageAreas && <p className="mt-1 text-sm text-muted-foreground">Coverage: {provider.coverageAreas}</p>}
          {provider.bio && <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{provider.bio}</p>}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{services.length}</span> {services.length === 1 ? "service" : "services"}
          </p>
          <div className="flex gap-3">
            <select value={category} onChange={(e) => setCategory(e.target.value as ServiceCategory | "all")} className={selectClass} aria-label="Category">
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={band} onChange={(e) => setBand(e.target.value as typeof band)} className={selectClass} aria-label="Price">
              {priceBands.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {provider.services.length === 0 && (
          <div className="rounded-lg bg-card py-16 text-center shadow-soft">
            <p className="font-medium text-foreground">No services yet</p>
            <p className="mt-1 text-sm text-muted-foreground">This provider has not published any services.</p>
          </div>
        )}
        {provider.services.length > 0 && services.length === 0 && (
          <div className="rounded-lg bg-card py-16 text-center shadow-soft">
            <p className="font-medium text-foreground">No services match your filters</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different category or price range.</p>
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((s) => (
            <PackageCard key={s.id} pkg={toServicePackage(s)} rating={summarize(ratings[s.id] ?? [])} />
          ))}
        </div>
      </div>
    </div>
  )
}
