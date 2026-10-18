import type { Booking } from "./mock-data"

export type PublicReview = { rating: number; comment: string; createdAt: string; reviewer: string }
export type ServiceRatings = Record<string, PublicReview[]>
export type RatingSummary = { average: number; count: number }

export const SERVICE_RATINGS_KEY = "soundstage-service-ratings-v1"

export function reviewerName(full: string | undefined): string {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean)
  if (!words.length || words.some((w) => w.includes("@"))) return "Client"
  if (words.length === 1) return words[0]
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`
}

export function buildServiceRatings(bookings: Booking[]): ServiceRatings {
  const ratings: ServiceRatings = {}
  for (const b of bookings) {
    const f = b.feedback
    if ((b.status !== "Completed" && b.status !== "completed") || !f || !Number.isInteger(f.rating) || f.rating < 1 || f.rating > 5) continue
    ;(ratings[b.packageId] ??= []).push({ rating: f.rating, comment: String(f.comment ?? ""), createdAt: String(f.createdAt ?? ""), reviewer: reviewerName(b.client) })
  }
  for (const list of Object.values(ratings)) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return ratings
}

export function summarize(reviews: PublicReview[]): RatingSummary {
  if (!reviews.length) return { average: 0, count: 0 }
  const total = reviews.reduce((sum, r) => sum + r.rating, 0)
  return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length }
}

export function providerSummary(serviceIds: string[], ratings: ServiceRatings): RatingSummary {
  return summarize(serviceIds.flatMap((id) => ratings[id] ?? []))
}
