"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapPin, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { type ServicePackage, formatPeso } from "@/lib/mock-data"
import { isLoggedIn } from "@/lib/client-auth"

export function PackageCard({ pkg }: { pkg: ServicePackage }) {
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
      className="group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card transition-all hover:border-primary/40 hover:shadow-[0_12px_48px_-16px_rgba(0,229,255,0.35)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={pkg.image || "/placeholder.svg"}
          alt={pkg.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge variant="secondary" className="border-border/60 bg-background/70 text-foreground backdrop-blur">
            {pkg.category}
          </Badge>
          {pkg.premium && (
            <Badge className="gap-1 border-accent/40 bg-accent/20 text-accent">
              <Sparkles width={12} height={12} />
              Premium
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-tight text-foreground text-balance">
            {pkg.name}
          </h3>
        </div>
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
            <p className="font-display text-lg font-bold text-foreground">{formatPeso(pkg.price)}</p>
          </div>
          <span className="text-sm font-medium text-primary transition-colors group-hover:text-primary/80">
            View details
          </span>
        </div>
      </div>
    </Link>
  )
}
