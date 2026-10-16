"use client"

import { useEffect, useState } from "react"
import { StarRating } from "@/components/site/star-rating"
import { summarize, type PublicReview } from "@/lib/service-ratings"
import { getServiceRatings } from "@/lib/service-ratings-store"

export function ServiceReviews({ serviceId }: { serviceId: string }) {
  const [reviews, setReviews] = useState<PublicReview[]>([])

  useEffect(() => {
    const load = () => setReviews(getServiceRatings()[serviceId] ?? [])
    load()
    window.addEventListener("soundstage-services-updated", load)
    return () => window.removeEventListener("soundstage-services-updated", load)
  }, [serviceId])

  const summary = summarize(reviews)
  return (
    <section className="mt-8">
      <h2 className="font-sans text-xl font-semibold">Reviews</h2>
      {summary.count ? <StarRating rating={summary.average} reviews={summary.count} size={16} className="mt-2" /> : <p className="mt-2 text-sm text-muted-foreground">No reviews yet</p>}
      {reviews.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {reviews.map((r, i) => (
            <li key={`${r.createdAt}-${i}`} className="rounded-lg bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <StarRating rating={r.rating} />
                <span className="text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-PH") : ""}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-foreground">{r.comment}</p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">{r.reviewer}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
