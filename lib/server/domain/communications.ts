import { storage, session, events } from "../runtime"
import { recordAdminAction, recordMarketplaceAction } from "./marketplace-billing"
import type { AccountRole } from "./client-auth"

export type BookingMessage = {
  id: string
  bookingId: string
  client: string
  provider: string
  senderRole: "client" | "provider"
  senderName: string
  body: string
  createdAt: string
}

export type ProviderReport = {
  id: string
  bookingId: string
  client: string
  clientEmail: string
  provider: string
  reason: string
  details: string
  status: "Pending" | "Resolved"
  createdAt: string
}

const MESSAGES_KEY = "soundstage-booking-messages-v1"
const REPORTS_KEY = "soundstage-provider-reports-v1"

function read<T>(key: string): T[] {
  if (typeof events === "undefined") return []
  try {
    const value = JSON.parse(storage.getItem(key) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function getBookingMessages() { return read<BookingMessage>(MESSAGES_KEY) }

export function sendBookingMessage(message: Omit<BookingMessage, "id" | "createdAt">) {
  const saved: BookingMessage = { ...message, id: `MSG-${crypto.randomUUID()}`, createdAt: new Date().toISOString() }
  storage.setItem(MESSAGES_KEY, JSON.stringify([...getBookingMessages(), saved]))
  recordMarketplaceAction("Message sent", saved.id, "New", `Booking ${saved.bookingId}; sender ${saved.senderName}`)
  events.dispatchEvent(new Event("soundstage-messages-updated"))
  return saved
}

export function getProviderReports() { return read<ProviderReport>(REPORTS_KEY) }

export function submitProviderReport(report: Omit<ProviderReport, "id" | "status" | "createdAt">) {
  const saved: ProviderReport = { ...report, id: `RPT-${crypto.randomUUID()}`, status: "Pending", createdAt: new Date().toISOString() }
  storage.setItem(REPORTS_KEY, JSON.stringify([saved, ...getProviderReports()]))
  recordMarketplaceAction("Report submitted", saved.id, "New", `${saved.reason}; booking ${saved.bookingId}`)
  events.dispatchEvent(new Event("soundstage-reports-updated"))
  return saved
}

export function updateProviderReportStatus(id: string, status: ProviderReport["status"]) {
  const existing = getProviderReports().find(report => report.id === id)
  if (!existing || existing.status === status) return
  recordAdminAction("Report status changed", id, existing.status, status)
  const reports = getProviderReports().map((report) => report.id === id ? { ...report, status } : report)
  storage.setItem(REPORTS_KEY, JSON.stringify(reports))
  events.dispatchEvent(new Event("soundstage-reports-updated"))
}

export function canViewConversation(role: AccountRole, participantName: string, client: string, provider: string) {
  return role === "admin" || (role === "client" ? participantName === client : participantName === provider)
}
