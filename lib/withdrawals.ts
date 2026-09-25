import { appStorage, mutate } from "./app-store"
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
  if (typeof window === "undefined") return []
  const value = appStorage.getItem(WITHDRAWALS_KEY)
  if (!value) return []
  try { const requests = JSON.parse(value); return Array.isArray(requests) ? requests : [] } catch { return [] }
}

function write(requests: WithdrawalRequest[]) {
  appStorage.setItem(WITHDRAWALS_KEY, JSON.stringify(requests))
  window.dispatchEvent(new Event(WITHDRAWALS_UPDATED_EVENT))
}

export function getWithdrawalRequests() { return read() }

export function createWithdrawalRequest(input: Omit<WithdrawalRequest, "id" | "requestedAt" | "status">) { return mutate<WithdrawalRequest>("createWithdrawalRequest", [input]) }

export function updateWithdrawalStatus(id: string, status: WithdrawalStatus) { return mutate<void>("updateWithdrawalStatus", [id, status]) }
