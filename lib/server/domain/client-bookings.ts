import type { Booking } from "@/lib/marketplace/mock-data"
import { RequestError } from "../request-error"
import { getAccount } from "./client-auth"
import { createBooking, lockOwned, transition, type BookingInput } from "../bookings/core"
import { requestCancellation } from "../bookings/requests"
import { listVisible, requestRefund, reviewRefund, submitFeedback } from "../bookings/compat"
import type { Actor } from "../bookings/rules"

// The exported names stay for existing callers; every function now runs on the booking tables (AC26).
function actor(): Actor {
  const account = getAccount()
  if (!account) throw new RequestError("Sign in to continue.", 401)
  return { id: account.email, email: account.email, role: account.role as Actor["role"] }
}

// Every booking: admin and payroll master only (review-4 m4).
export async function getAllBookings(): Promise<Booking[]> {
  const who = actor()
  if (who.role !== "admin" && who.role !== "payroll_master") throw new RequestError("You do not have permission for this operation.", 403)
  return (await listVisible({ email: "", role: "admin" })).map(v => v.booking)
}

export async function getClientBookings(): Promise<Booking[]> {
  const account = getAccount()
  return (await listVisible(account ? { email: account.email, role: account.role } : null)).map(v => v.booking)
}

export function saveClientBooking(booking: Record<string, unknown> & { idempotencyKey?: unknown }) {
  return createBooking(actor(), booking as unknown as BookingInput, String(booking.idempotencyKey || ""))
}

// Legacy status names map onto the spec transitions so old buttons keep working.
export async function updateClientBookingStatus(id: string, status: string) {
  const who = actor()
  if (status === "Confirmed") return transition(id, "accepted", who)
  if (status === "Cancelled") return who.role === "client" ? requestCancellation(who, id) : transition(id, "cancelled", who, "Cancelled by provider")
  if (status === "Completed") {
    // A confirmed event is started first; one already in progress goes straight to completed.
    if ((await lockOwned(id, who)).status !== "in_progress") await transition(id, "in_progress", who)
    return transition(id, "completed", who)
  }
  // Declines need a reason, so they go through the declineBooking action only.
  if (["accepted", "in_progress", "completed"].includes(status)) return transition(id, status, who)
  throw new RequestError("Invalid booking status.")
}

export function submitEventFeedback(id: string, rating: number, comment: string) {
  return submitFeedback(actor(), id, rating, comment)
}

export function requestBookingRefund(id: string, method: string, account: string) {
  return requestRefund(actor(), id, method, account)
}

export function reviewBookingRefund(id: string, status: "Paid" | "Rejected", details: string) {
  return reviewRefund(actor(), id, status, details)
}
