"use client"

import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { ProviderCard } from "@/components/browse/provider-card"
import { providerSummary, type ServiceRatings } from "@/lib/service-ratings"
import { getServiceRatings } from "@/lib/service-ratings-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  filterProviders,
  getPublicProviders,
  sortProviders,
  type ProviderProfile,
  type ProviderSortKey,
} from "@/lib/provider-services"
import { locations, type Location } from "@/lib/mock-data"

const selectClass = "h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"

export function ServicesBrowser() {
  const [query, setQuery] = useState("")
  const [place, setPlace] = useState<"All" | Location>("All")
  const [sort, setSort] = useState<ProviderSortKey | "rating-desc" | "rating-asc">("recommended")
  const [providers, setProviders] = useState<ProviderProfile[]>([])
  const [ratings, setRatings] = useState<ServiceRatings>({})

  useEffect(() => {
    const load = () => { setProviders(getPublicProviders()); setRatings(getServiceRatings()) }
    load()
    window.addEventListener("soundstage-services-updated", load)
    return () => window.removeEventListener("soundstage-services-updated", load)
  }, [])

  const results = useMemo(() => {
    const byPlace = place === "All"
      ? providers
      : providers.filter((p) => `${p.location} ${p.coverageAreas}`.toLowerCase().includes(place.toLowerCase()))
    const filtered = filterProviders(byPlace, query, "All", "Any price")
    if (sort === "recommended") return sortProviders(filtered, sort)
    const scored = filtered.map((p) => ({ p, ...providerSummary(p.services.map((s) => s.id), ratings) }))
    const rated = scored.filter((s) => s.count > 0).sort((a, b) => (sort === "rating-desc" ? b.average - a.average : a.average - b.average) || b.count - a.count)
    return [...rated, ...scored.filter((s) => s.count === 0)].map((s) => s.p)
  }, [place, providers, query, ratings, sort])

  function reset() {
    setQuery("")
    setPlace("All")
    setSort("recommended")
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers or services"
            className="h-10 pl-9"
            aria-label="Search providers or services"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Location
          <select value={place} onChange={(e) => setPlace(e.target.value as "All" | Location)} className={selectClass}>
            <option value="All">All locations</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{results.length}</span> {results.length === 1 ? "provider" : "providers"} found
        </p>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selectClass} aria-label="Sort providers">
          <option value="recommended">Recommended</option>
          <option value="rating-desc">Highest rating</option>
          <option value="rating-asc">Lowest rating</option>
        </select>
      </div>

      {results.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((p) => (
            <ProviderCard key={p.id} provider={p} rating={providerSummary(p.services.map((s) => s.id), ratings)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg bg-card py-20 text-center shadow-soft">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Search width={22} height={22} />
          </span>
          <p className="mt-4 font-medium text-foreground">{providers.length === 0 ? "No providers yet" : "No providers match your filters"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {providers.length === 0 ? "Providers will appear here once they are verified." : "Try adjusting your search or clearing filters."}
          </p>
          {providers.length > 0 && (
            <Button variant="outline" size="sm" onClick={reset} className="mt-4 border-border/70">
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
