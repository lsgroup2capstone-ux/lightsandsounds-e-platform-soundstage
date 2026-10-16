"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapPin, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { type ServicePackage, formatPeso } from "@/lib/mock-data"
import { isLoggedIn } from "@/lib/client-auth"
import { publicFileUrl } from "@/lib/file-upload"
import { StarRating } from "@/components/site/star-rating"
import type { RatingSummary } from "@/lib/service-ratings"

export function PackageCard({ pkg, rating }: { pkg: ServicePackage; rating?: RatingSummary }) {
  const router = useRouter()
  const packageHref = pkg.id.startsWith("service-") ? `/listed-services/${pkg.id}` : `/services/${pkg.id}`

  return (
    <Link
      href={packageHref}
      onClick={(event) => {
        if (isLoggedIn()) return
        event.preventDefault()
        router.push(`/login?returnTo=${encodeURIComponent(packageHref)}`)
      }}
      className="group flex flex-col overflow-hidden rounded-lg bg-card shadow-soft ring-1 ring-foreground/5 transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={publicFileUrl(pkg.image) || "/placeholder.svg"}
          alt={pkg.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge variant="secondary" className="bg-card/85 text-foreground shadow-soft backdrop-blur">
            {pkg.category}
          </Badge>
          {pkg.premium && (
            <Badge className="gap-1 bg-foreground text-background">
              <Sparkles width={12} height={12} />
              Premium
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold leading-tight tracking-tight text-foreground text-balance">
            {pkg.name}
          </h3>
        </div>
        {rating && (rating.count ? <StarRating rating={rating.average} reviews={rating.count} /> : <p className="text-xs text-muted-foreground">No reviews yet</p>)}
        <p className="text-sm text-muted-foreground line-clamp-2">{pkg.tagline}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin width={13} height={13} className="text-primary" />
            {pkg.location}
          </span>
        </div>
        <div className="mt-auto flex items-end justify-between border-t border-border/60 pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Starting at</p>
            <p className="text-lg font-semibold text-foreground">{formatPeso(pkg.price)}</p>
          </div>
          <span className="text-sm font-medium text-primary transition-colors group-hover:text-primary/80">
            View details
          </span>
        </div>
      </div>
    </Link>
  )
}
