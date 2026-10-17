import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

export function StarRating({
  rating,
  reviews,
  size = 14,
  className,
}: {
  rating: number
  reviews?: number
  size?: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            width={size}
            height={size}
            className={cn(
              i < Math.round(rating) ? "fill-warning text-warning" : "fill-transparent text-muted-foreground/40",
            )}
          />
        ))}
      </span>
      <span className="text-sm font-medium text-foreground">{rating.toFixed(1)}</span>
      {reviews !== undefined && <span className="text-xs text-muted-foreground">({reviews})</span>}
      <span className="sr-only">
        Rated {rating} out of 5{reviews !== undefined ? ` from ${reviews} reviews` : ""}
      </span>
    </div>
  )
}
