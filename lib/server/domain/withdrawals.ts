import { storage, session, events } from "../runtime"
import { recordAdminAction, recordMarketplaceAction } from "./marketplace-billing"
export type WithdrawalStatus = "Pending" | "Paid" | "Rejected"

export type WithdrawalRequest = {
  id: string
  provider: string
  providerEmail: string
  amount: number
  payoutMethod: string
  payoutAccount: string
  requestedAt: string
  processedAt?: string
  status: WithdrawalStatus
}

const WITHDRAWALS_KEY = "soundstage-withdrawals-v1"
export const WITHDRAWALS_UPDATED_EVENT = "soundstage-withdrawals-updated"

function read(): WithdrawalRequest[] {
  if (typeof events === "undefined") return []
  const value = storage.getItem(WITHDRAWALS_KEY)
  if (!value) return []
  try { const requests = JSON.parse(value); return Array.isArray(requests) ? requests : [] } catch { return [] }
}

function write(requests: WithdrawalRequest[]) {
  storage.setItem(WITHDRAWALS_KEY, JSON.stringify(requests))
  events.dispatchEvent(new Event(WITHDRAWALS_UPDATED_EVENT))
}

export function getWithdrawalRequests() { return read() }

export function createWithdrawalRequest(input: Omit<WithdrawalRequest, "id" | "requestedAt" | "status">) {
  const request: WithdrawalRequest = { ...input, id: `WD-${crypto.randomUUID()}`, requestedAt: new Date().toISOString(), status: "Pending" }
  write([request, ...read()])
  recordMarketplaceAction("Withdrawal requested", request.id, "New", `${request.amount} PHP; ${request.payoutMethod}`)
  return request
}

export function updateWithdrawalStatus(id: string, status: WithdrawalStatus) {
  const request = read().find(item => item.id === id)
  if (!request || request.status !== "Pending" || status === "Pending") return
  recordAdminAction("Withdrawal reviewed", id, request.status, status)
  write(read().map((request) => request.id === id ? { ...request, status, processedAt: new Date().toISOString() } : request))
}
