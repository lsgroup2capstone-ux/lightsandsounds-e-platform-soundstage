import { storage, session, events } from "../runtime"
import type { Booking } from "@/lib/mock-data"
import { getAccount } from "./client-auth"
import { recordMarketplaceAction, recordAdminAction } from "./marketplace-billing"

const BOOKINGS_PREFIX = "soundstage-client-bookings-v3:"

function accountKey() {
  const account = getAccount()
  return account?.role === "client" ? `${BOOKINGS_PREFIX}${encodeURIComponent(account.email.trim().toLowerCase())}` : null
}

function readBookings(key: string): Booking[] {
  const value = storage.getItem(key)
  if (!value) return []
  try { const bookings = JSON.parse(value); return Array.isArray(bookings) ? bookings : [] } catch { return [] }
}

export function getAllBookings(): Booking[] {
  if (typeof events === "undefined") return []
  const bookings: Booking[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(BOOKINGS_PREFIX)) bookings.push(...readBookings(key))
  }
  return bookings
}

export function getClientBookings(): Booking[] {
  if (typeof events === "undefined") return []
  const key = accountKey()
  return key ? readBookings(key) : getAllBookings()
}

export function saveClientBooking(booking: Booking) {
  const key = accountKey()
  if (!key) return
  const bookings = readBookings(key)
  if (bookings.some((item) => item.id === booking.id)) return
  storage.setItem(key, JSON.stringify([booking, ...bookings]))
  recordMarketplaceAction("Booking created", booking.id, "New", `${booking.status}; ${booking.paid ? booking.downpayment + " PHP paid" : "Unpaid"}`)
  events.dispatchEvent(new Event("soundstage-bookings-updated"))
}

export function updateClientBookingStatus(id: string, status: Booking["status"]) {
  const ownKey = accountKey()
  const keys = ownKey ? [ownKey] : Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key?.startsWith(BOOKINGS_PREFIX)))
  let updated: Booking | null = null
  for (const key of keys) {
    const bookings = readBookings(key).map((booking) => {
      if (booking.id !== id) return booking
      const actor = getAccount()
      if (!actor || (actor.role === "provider" && booking.provider !== (actor.business || `${actor.firstName} ${actor.lastName}`))) throw new Error("You cannot update this booking.")
      if (actor.role === "client" && status !== "Cancelled") throw new Error("Clients can only cancel their bookings.")
      if (booking.status === status) return booking
      if (booking.status === "Cancelled") throw new Error("Cancelled events cannot change status.")
      if (status === "Completed") {
        const actor = getAccount()
        if (actor?.role !== "provider" || booking.provider !== (actor.business || `${actor.firstName} ${actor.lastName}`)) throw new Error("Only the event provider can complete this booking.")
        if (booking.status === "Completed") return booking
        if (booking.status !== "Confirmed") throw new Error("Only confirmed events can be completed.")
      }
      if (booking.status === "Completed") throw new Error("Completed events cannot change status.")
      updated = { ...booking, status, ...(status === "Completed" ? { completedAt: new Date().toISOString() } : {}), ...(status === "Cancelled" ? { cancelledBy: actor.role as Booking["cancelledBy"], cancelledAt: new Date().toISOString() } : {}) }
      recordMarketplaceAction("Booking status changed", id, booking.status, `${status}${status === "Cancelled" ? ` by ${actor.role}` : ""}`)
      return updated
    })
    storage.setItem(key, JSON.stringify(bookings))
  }
  events.dispatchEvent(new Event("soundstage-bookings-updated"))
  return updated
}

export function submitEventFeedback(id: string, rating: number, comment: string) {
  const key = accountKey()
  if (!key) throw new Error("Sign in as the client to leave feedback.")
  const bookings = readBookings(key)
  const booking = bookings.find(item => item.id === id)
  if (!booking || booking.status !== "Completed") throw new Error("Feedback is available only for your completed events.")
  if (booking.feedback) throw new Error("Feedback has already been submitted for this event.")
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment.trim() || comment.trim().length > 2000) throw new Error("Choose 1–5 stars and enter feedback up to 2,000 characters.")
  booking.feedback = { rating, comment: comment.trim(), createdAt: new Date().toISOString() }
  storage.setItem(key, JSON.stringify(bookings))
  recordMarketplaceAction("Event feedback submitted", id, "No feedback", `${rating}/5 stars; ${comment.trim()}`)
  events.dispatchEvent(new Event("soundstage-bookings-updated"))
}

export function requestBookingRefund(id: string, method: string, account: string) {
  const key = accountKey()
  if (!key) throw new Error("Sign in as the booking client.")
  const bookings = readBookings(key); const booking = bookings.find(b => b.id === id)
  if (!booking || booking.status !== "Cancelled" || booking.cancelledBy !== "provider" || !booking.paid || booking.downpayment <= 0) throw new Error("Only paid events cancelled by the provider qualify for a refund.")
  if (booking.refund) throw new Error("A refund request already exists for this event.")
  if (!["GCash", "Maya", "Bank transfer"].includes(method) || account.trim().length < 6 || account.length > 200) throw new Error("Enter a valid payout method and account details.")
  booking.refund = { status: "Pending", amount: booking.downpayment, method, account: account.trim(), requestedAt: new Date().toISOString() }
  storage.setItem(key, JSON.stringify(bookings))
  recordMarketplaceAction("Refund requested", id, "Eligible", `Pending: ${booking.downpayment} PHP`)
  events.dispatchEvent(new Event("soundstage-bookings-updated"))
}

export function reviewBookingRefund(id: string, status: "Paid" | "Rejected", details: string) {
  if (getAccount()?.role !== "admin") throw new Error("Administrator access required.")
  if (!["Paid", "Rejected"].includes(status) || details.trim().length < 3 || details.length > 200) throw new Error("Enter a payout reference or rejection reason (3–200 characters).")
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => Boolean(key?.startsWith(BOOKINGS_PREFIX)))
  for (const key of keys) {
    const bookings = readBookings(key); const booking = bookings.find(b => b.id === id)
    if (!booking) continue
    if (!booking.refund || booking.refund.status !== "Pending") throw new Error("This refund is no longer pending.")
    booking.refund = { ...booking.refund, status, processedAt: new Date().toISOString(), ...(status === "Paid" ? { reference: details.trim() } : { reason: details.trim() }) }
    storage.setItem(key, JSON.stringify(bookings))
    recordAdminAction("Refund reviewed", id, "Pending", `${status}: ${booking.refund.amount} PHP; ${details.trim()}`)
    events.dispatchEvent(new Event("soundstage-bookings-updated"))
    return
  }
  throw new Error("Booking not found.")
}
