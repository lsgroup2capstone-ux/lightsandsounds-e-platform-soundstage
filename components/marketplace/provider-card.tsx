import Image from "next/image"
import Link from "next/link"
import { MapPin } from "lucide-react"
import { formatPeso } from "@/lib/marketplace/mock-data"
import { publicFileUrl } from "@/lib/data/file-upload"
import type { ProviderProfile } from "@/lib/marketplace/provider-services"
import { StarRating } from "@/components/marketplace/star-rating"
import type { RatingSummary } from "@/lib/marketplace/service-ratings"

export function ProviderCard({ provider, rating }: { provider: ProviderProfile; rating: RatingSummary }) {
  const count = provider.services.length
  return (
    <Link
      href={`/providers/${provider.id}`}
      className="group flex flex-col overflow-hidden rounded-lg bg-card shadow-soft ring-1 ring-foreground/5 transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={publicFileUrl(provider.image) || "/placeholder.svg"}
          alt={provider.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="text-lg font-semibold leading-tight tracking-tight text-foreground text-balance">{provider.name}</h3>
        {rating.count ? <StarRating rating={rating.average} reviews={rating.count} /> : <p className="text-xs text-muted-foreground">No reviews yet</p>}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {provider.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin width={13} height={13} className="text-primary" />
              {provider.location}
            </span>
          )}
          <span>
            {count} {count === 1 ? "service" : "services"}
          </span>
        </div>
        <div className="mt-auto flex items-end justify-between border-t border-border/60 pt-3">
          <div>
            {count ? (
              <>
                <p className="text-xs text-muted-foreground">Starting at</p>
                <p className="text-lg font-semibold text-foreground">from {formatPeso(provider.minPrice)}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">No services yet</p>
            )}
          </div>
          <span className="text-sm font-medium text-primary transition-colors group-hover:text-primary/80">View provider</span>
        </div>
      </div>
    </Link>
  )
}
