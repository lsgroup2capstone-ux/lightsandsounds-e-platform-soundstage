import { appStorage, mutate } from "../data/app-store"
import type { AccountRole } from "@/lib/auth/client-auth"

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
  if (typeof window === "undefined") return []
  try {
    const value = JSON.parse(appStorage.getItem(key) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function getBookingMessages() { return read<BookingMessage>(MESSAGES_KEY) }

export function sendBookingMessage(message: Omit<BookingMessage, "id" | "createdAt">) { return mutate<BookingMessage>("sendBookingMessage", [message]) }

export function getProviderReports() { return read<ProviderReport>(REPORTS_KEY) }

export function submitProviderReport(report: Omit<ProviderReport, "id" | "status" | "createdAt">) { return mutate<ProviderReport>("submitProviderReport", [report]) }

export function updateProviderReportStatus(id: string, status: ProviderReport["status"]) { return mutate<void>("updateProviderReportStatus", [id, status]) }

export function canViewConversation(role: AccountRole, participantName: string, client: string, provider: string) {
  return role === "admin" || (role === "client" ? participantName === client : participantName === provider)
}
