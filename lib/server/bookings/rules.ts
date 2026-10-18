// Booking status flow (spec "Allowed transitions"). Refund decisions run as system after a payroll-master check.
export const BOOKING_STATUSES = ["pending", "accepted", "awaiting_payment", "confirmed", "in_progress", "completed", "declined", "cancelled", "refund_pending", "refunded"] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]
export type ActorRole = "client" | "provider" | "admin" | "payroll_master" | "system"
export type Actor = { id: string; email: string; role: ActorRole }
export type Check = "available" | "reason" | "unpaid" | "started" | "downpayment" | "refundable"
export type Rule = { from: BookingStatus; to: BookingStatus; actor: "client" | "provider" | "system"; checks: Check[] }

export const TRANSITIONS: Rule[] = [
  { from: "pending", to: "accepted", actor: "provider", checks: ["available"] },
  { from: "pending", to: "declined", actor: "provider", checks: ["reason"] },
  { from: "pending", to: "cancelled", actor: "client", checks: ["unpaid"] },
  { from: "accepted", to: "cancelled", actor: "client", checks: ["unpaid"] },
  { from: "awaiting_payment", to: "cancelled", actor: "client", checks: ["unpaid"] },
  { from: "accepted", to: "awaiting_payment", actor: "system", checks: [] },
  { from: "awaiting_payment", to: "confirmed", actor: "system", checks: ["downpayment"] },
  { from: "awaiting_payment", to: "cancelled", actor: "system", checks: ["reason"] },
  { from: "confirmed", to: "in_progress", actor: "provider", checks: ["started"] },
  { from: "in_progress", to: "completed", actor: "provider", checks: ["started"] },
  { from: "confirmed", to: "cancelled", actor: "provider", checks: ["reason"] },
  { from: "confirmed", to: "cancelled", actor: "system", checks: ["reason"] },
  { from: "cancelled", to: "refund_pending", actor: "client", checks: ["refundable", "reason"] },
  { from: "refund_pending", to: "refunded", actor: "system", checks: ["reason"] },
  { from: "refund_pending", to: "cancelled", actor: "system", checks: ["reason"] },
]

export function findRule(from: string, to: string, role: ActorRole) {
  return TRANSITIONS.find(rule => rule.from === from && rule.to === to && rule.actor === role)
}

const verbs: Partial<Record<BookingStatus, string>> = { accepted: "accept", declined: "decline", cancelled: "cancel", awaiting_payment: "request payment for", confirmed: "confirm", in_progress: "start", completed: "complete", refund_pending: "request a refund for", refunded: "refund" }
export const verb = (to: string) => verbs[to as BookingStatus] || "update"
