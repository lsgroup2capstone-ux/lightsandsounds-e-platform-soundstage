"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { getClientBookings } from "@/lib/client-bookings"
import { getSubscriptionPayments, MARKETPLACE_EVENT } from "@/lib/marketplace-billing"
import { getWithdrawalRequests, WITHDRAWALS_UPDATED_EVENT } from "@/lib/withdrawals"
import { formatPeso } from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PaymentReceipt } from "./payment-receipt"
import { SubscriptionReceipt } from "./subscription-panel"

type Transaction = { id: string; kind: string; at: string; amount: number; status: string; details: [string, string][]; receipt?: React.ReactNode }
export function RecentTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  useEffect(() => {
    const refresh = () => {
      const bookings = getClientBookings()
      const rows: Transaction[] = bookings.filter(b => b.paid).map(b => ({ id: b.id, kind: "Booking payment", at: b.paidAt || "", amount: b.downpayment, status: b.refund?.status === "Paid" ? "Refunded" : "Paid", details: [["Client", b.client], ["Provider", b.provider], ["Service", b.packageName], ["Event date and time", `${b.date} ${b.time}`], ["Duration", `${b.durationDays || 1} days`], ["Venue", b.location], ["Guests", String(b.guests)], ["Notes", b.notes || "None"], ["Method", b.paymentMethod || "Not recorded"], ["Invoice", `SI-${b.id.replace("BK-", "")}`], ["Event total", formatPeso(b.total)], ["Downpayment", formatPeso(b.downpayment)], ["Booking status", b.status], ["Cancelled by", b.cancelledBy || "Not cancelled"], ["Refund status", b.refund?.status || "None"]], receipt: <PaymentReceipt booking={b} /> }))
      for (const p of getSubscriptionPayments()) rows.push({ id: p.id, kind: "Subscription payment", at: p.paidAt || p.createdAt, amount: p.amount, status: p.status, details: [["Customer", p.customer], ["Email", p.email], ["Plan", `${p.plan} / 30 days`], ["Method", p.method], ["Reference", p.reference], ["Invoice", p.invoice || "Not issued"], ["Submitted", p.createdAt], ["Paid at", p.paidAt || "Not paid"]], receipt: p.status === "Paid" ? <SubscriptionReceipt payment={p} /> : undefined })
      for (const w of getWithdrawalRequests()) rows.push({ id: w.id, kind: "Provider withdrawal", at: w.processedAt || w.requestedAt, amount: w.amount, status: w.status, details: [["Provider", w.provider], ["Email", w.providerEmail], ["Method", w.payoutMethod], ["Payout account", w.payoutAccount], ["Requested", w.requestedAt], ["Processed", w.processedAt || "Pending"]] })
      for (const b of bookings) { const r = b.refund; if (r) rows.push({ id: `RF-${b.id}`, kind: "Client refund", at: r.processedAt || r.requestedAt, amount: r.amount, status: r.status, details: [["Booking", b.id], ["Client", b.client], ["Provider", b.provider], ["Service", b.packageName], ["Method", r.method], ["Payout account", r.account], ["Requested", r.requestedAt], ["Processed", r.processedAt || "Pending"], ["Transfer reference", r.reference || "Not recorded"], ["Rejection reason", r.reason || "None"]] }) }
      setTransactions(rows.sort((a, b) => b.at.localeCompare(a.at)))
    }
    refresh()
    const events = ["soundstage-bookings-updated", MARKETPLACE_EVENT, WITHDRAWALS_UPDATED_EVENT, "storage"]
    events.forEach(event => window.addEventListener(event, refresh))
    return () => events.forEach(event => window.removeEventListener(event, refresh))
  }, [])
  return <Card><CardHeader><CardTitle>Recent transactions</CardTitle><p className="text-sm text-muted-foreground">Booking payments, subscriptions, withdrawals and refunds, newest first. Click a transaction to open its matching record.</p></CardHeader><CardContent className="space-y-3">{!transactions.length && <p className="py-8 text-center text-muted-foreground">No transactions recorded yet.</p>}{transactions.map(t => <div key={`${t.kind}-${t.id}`} className="overflow-hidden rounded-lg border"><Link className="block p-4 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary" href={`${t.kind === "Client refund" ? "/admin/refunds" : "/admin/payments"}#transaction-${encodeURIComponent(t.id)}`} aria-label={`Open ${t.kind.toLowerCase()} ${t.id}`}><span className="font-medium">{t.kind} / {formatPeso(t.amount)} / {t.status}</span><span className="mt-1 block break-all text-xs text-muted-foreground">{t.id} / {t.at ? new Date(t.at).toLocaleString() : "Date not recorded"}</span><span className="mt-2 block text-xs text-primary">Open transaction &rarr;</span></Link><details className="border-t px-4 py-3"><summary className="cursor-pointer text-sm text-muted-foreground">Preview full details</summary><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">{t.details.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>{t.receipt && <div className="mt-4">{t.receipt}</div>}</details></div>)}</CardContent></Card>
}
