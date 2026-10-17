import { appStorage, mutate } from "../data/app-store"
import type { Booking } from "@/lib/marketplace/mock-data"
import { getAccount } from "@/lib/auth/client-auth"

const BOOKINGS_PREFIX = "soundstage-client-bookings-v3:"

function accountKey() {
  const account = getAccount()
  return account?.role === "client" ? `${BOOKINGS_PREFIX}${encodeURIComponent(account.email.trim().toLowerCase())}` : null
}

function readBookings(key: string): Booking[] {
  const value = appStorage.getItem(key)
  if (!value) return []
  try { const bookings = JSON.parse(value); return Array.isArray(bookings) ? bookings : [] } catch { return [] }
}

export function getAllBookings(): Booking[] {
  if (typeof window === "undefined") return []
  const bookings: Booking[] = []
  for (let index = 0; index < appStorage.length; index += 1) {
    const key = appStorage.key(index)
    if (key?.startsWith(BOOKINGS_PREFIX)) bookings.push(...readBookings(key))
  }
  return bookings
}

export function getClientBookings(): Booking[] {
  if (typeof window === "undefined") return []
  const key = accountKey()
  return key ? readBookings(key) : getAllBookings()
}

export function saveClientBooking(booking: Booking) { return mutate<{ id: string; checkoutUrl: string }>("saveClientBooking", [booking]) }

export function updateClientBookingStatus(id: string, status: Booking["status"]) { return mutate<Booking | null>("updateClientBookingStatus", [id, status]) }

export function submitEventFeedback(id: string, rating: number, comment: string) { return mutate<void>("submitEventFeedback", [id, rating, comment]) }

export function requestBookingRefund(id: string, method: string, account: string) { return mutate<void>("requestBookingRefund", [id, method, account]) }

export function reviewBookingRefund(id: string, status: "Paid" | "Rejected", details: string) { return mutate<void>("reviewBookingRefund", [id, status, details]) }
