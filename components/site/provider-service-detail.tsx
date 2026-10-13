"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BookingFlow } from "@/components/booking/booking-flow"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { getProviderServices, type ProviderService } from "@/lib/provider-services"
import { type Location, type ServicePackage, formatPeso } from "@/lib/mock-data"
import { getCoveredCitiesAndTowns } from "@/lib/coverage-areas"
import { publicFileUrl } from "@/lib/file-upload"

export function ProviderServiceDetail({ id }: { id: string }) {
  const [service, setService] = useState<ProviderService | null | undefined>(undefined)
  useEffect(() => { setService(getProviderServices().find((item) => item.id === id && item.active) || null) }, [id])
  if (service === undefined) return null
  if (!service) return <div className="flex min-h-dvh flex-col"><SiteHeader /><main className="mx-auto w-full max-w-4xl flex-1 px-4 py-16 text-center"><h1 className="text-2xl font-bold">Service not found</h1><Button asChild className="mt-5"><Link href="/browse">Back to browse</Link></Button></main><SiteFooter /></div>

  const coverageAreas = service.coverageAreas || service.location
  const pkg: ServicePackage = { id: service.id, name: service.name, provider: { id: `provider-${service.id}`, name: service.providerName, location: service.location as Location, rating: 0, reviews: 0, verified: false, since: new Date().getFullYear(), bio: service.description }, category: "Full Production", location: service.location as Location, price: service.price, image: service.image, rating: 0, reviews: 0, premium: false, tagline: service.description, inclusions: [], capacity: "Contact provider for capacity", coverageAreas, transportationFee: service.transportationFee || 0 }
  const coveredAreaList = getCoveredCitiesAndTowns(coverageAreas)
  return <div className="flex min-h-dvh flex-col"><SiteHeader /><main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6"><Link href="/browse" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft width={15} />Back to browse</Link><div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]"><div><img src={publicFileUrl(service.image) || "/placeholder.svg"} alt={service.name} className="aspect-video w-full rounded-xl object-cover shadow-soft" /><h1 className="mt-6 text-4xl font-semibold tracking-tight">{service.name}</h1><p className="mt-3 leading-relaxed text-muted-foreground">{service.description}</p><p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground"><MapPin width={16} className="text-primary" />Covered cities/towns: {coverageAreas}</p><div className="mt-4 flex flex-wrap gap-2">{coveredAreaList.map((area) => <span key={area} className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{area}</span>)}</div><p className="mt-2 text-xs text-muted-foreground">All barangays within the listed cities and towns are included. Transportation outside the covered area starts at ₱1,000 and increases for farther destinations.</p><div className="mt-8 rounded-lg bg-card p-5 shadow-soft"><p className="text-sm text-muted-foreground">Service provider</p><p className="mt-1 text-lg font-semibold">{service.providerName}</p></div></div><aside className="lg:sticky lg:top-20 lg:self-start"><div className="rounded-xl bg-card p-6 shadow-soft"><p className="text-sm text-muted-foreground">Service price</p><p className="text-3xl font-semibold tracking-tight">{formatPeso(service.price)}</p><BookingFlow pkg={pkg} trigger={<Button size="lg" className="mt-5 w-full">Book this service</Button>} /></div></aside></div></main><SiteFooter /></div>
}
