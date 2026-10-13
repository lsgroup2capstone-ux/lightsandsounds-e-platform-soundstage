"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { PackageCard } from "@/components/site/package-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  type ServiceCategory,
  type Location,
  categories,
  locations,
  packages,
  type ServicePackage,
} from "@/lib/mock-data"
import { getProviderServices } from "@/lib/provider-services"
import { cn } from "@/lib/utils"

type SortKey = "recommended" | "price-asc" | "price-desc"

const priceBands = [
  { label: "Any price", value: "any" },
  { label: "Under \u20B115,000", value: "0-15000" },
  { label: "\u20B115,000 - \u20B130,000", value: "15000-30000" },
  { label: "Over \u20B130,000", value: "30000-999999" },
] as const

export function ServicesBrowser() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<ServiceCategory | "all">("all")
  const [location, setLocation] = useState<Location | "all">("all")
  const [band, setBand] = useState<(typeof priceBands)[number]["value"]>("any")
  const [sort, setSort] = useState<SortKey>("recommended")
  const [publishedServices, setPublishedServices] = useState<ServicePackage[]>([])

  useEffect(() => {
    const loadServices = () => setPublishedServices(getProviderServices().filter((service) => service.active).map((service) => ({
      id: service.id,
      name: service.name,
      provider: { id: `provider-${service.id}`, name: service.providerName, location: service.location as Location, rating: 0, reviews: 0, verified: false, since: new Date().getFullYear(), bio: service.description },
      category: "Full Production" as const,
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
    })))
    loadServices()
    window.addEventListener("soundstage-services-updated", loadServices)
    return () => window.removeEventListener("soundstage-services-updated", loadServices)
  }, [])

  const results = useMemo(() => {
    const [min, max] = band === "any" ? [0, Infinity] : band.split("-").map(Number)
    const q = query.trim().toLowerCase()

    const filtered = [...packages, ...publishedServices].filter((p) => {
      if (category !== "all" && p.category !== category) return false
      if (location !== "all" && p.location !== location) return false
      if (p.price < min || p.price > max) return false
      if (q && !`${p.name} ${p.tagline} ${p.provider.name}`.toLowerCase().includes(q)) return false
      return true
    })

    switch (sort) {
      case "price-asc":
        return filtered.toSorted((a, b) => a.price - b.price)
      case "price-desc":
        return filtered.toSorted((a, b) => b.price - a.price)
      default:
        return filtered
    }
  }, [query, category, location, band, sort, publishedServices])

  const hasFilters = false

  function reset() {
    setQuery("")
    setCategory("all")
    setLocation("all")
    setBand("any")
    setSort("recommended")
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div>
        {/* Filters */}
        <aside className="mb-6 max-w-xl">
          <div className="relative">
            <Search
              width={16}
              height={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search packages"
              className="pl-9"
              aria-label="Search packages"
            />
          </div>

          <FilterGroup label="Category">
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
              All
            </FilterChip>
            {categories.map((c) => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="Location">
            <FilterChip active={location === "all"} onClick={() => setLocation("all")}>
              All
            </FilterChip>
            {locations.map((l) => (
              <FilterChip key={l} active={location === l} onClick={() => setLocation(l)}>
                {l}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="Price range">
            {priceBands.map((p) => (
              <FilterChip key={p.value} active={band === p.value} onClick={() => setBand(p.value)}>
                {p.label}
              </FilterChip>
            ))}
          </FilterGroup>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={reset} className="justify-start text-muted-foreground">
              <X width={15} height={15} />
              Clear filters
            </Button>
          )}
        </aside>

        {/* Results */}
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{results.length}</span>{" "}
              {results.length === 1 ? "package" : "packages"} found
            </p>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <SlidersHorizontal width={15} height={15} />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                aria-label="Sort packages"
              >
                <option value="recommended">Recommended</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </select>
            </label>
          </div>

          {results.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg bg-card py-20 shadow-soft text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Search width={22} height={22} />
              </span>
              <p className="mt-4 font-medium text-foreground">{packages.length + publishedServices.length === 0 ? "No service packages available" : "No packages match your filters"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{packages.length + publishedServices.length === 0 ? "Provider packages will appear here when they are published." : "Try adjusting your search or clearing filters."}</p>
              {packages.length + publishedServices.length > 0 && <Button variant="outline" size="sm" onClick={reset} className="mt-4 border-border/70">Clear filters</Button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hidden">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-all",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
