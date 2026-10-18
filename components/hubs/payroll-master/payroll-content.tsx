"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, CircleDollarSign, Clock3, ShieldCheck, TrendingUp, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { peso, type AnySection } from "@/lib/data/hub-data"
import { getClientBookings } from "@/lib/booking/client-bookings"
import { type Booking } from "@/lib/marketplace/mock-data"
import { AuditPanel, SubscriptionPayments } from "@/components/payment/subscription-panel"
import { RefundsPanel } from "@/components/payment/refunds-panel"
import { getSubscriptionPayments } from "@/lib/payments/marketplace-billing"
import { PaymentReceipt } from "@/components/payment/payment-receipt"
import { AdminReportsPanel } from "@/components/communications/communication-panels"
import { getWithdrawalRequests, updateWithdrawalStatus, WITHDRAWALS_UPDATED_EVENT, type WithdrawalRequest } from "@/lib/payments/withdrawals"
import { Stat, Status, Table } from "@/components/hubs/shared/hub-ui"

export function PayrollContent({ section }: { section: AnySection }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [error, setError] = useState("")
  useEffect(() => {
    const refresh = () => { setBookings(getClientBookings()); setWithdrawals(getWithdrawalRequests()) }
    refresh()
    window.addEventListener("soundstage-bookings-updated", refresh)
    window.addEventListener(WITHDRAWALS_UPDATED_EVENT, refresh)
    return () => { window.removeEventListener("soundstage-bookings-updated", refresh); window.removeEventListener(WITHDRAWALS_UPDATED_EVENT, refresh) }
  }, [])
  async function reviewPayout(id: string, status: "Paid" | "Rejected") { try { await updateWithdrawalStatus(id, status); setError("") } catch (e) { setError((e as Error).message) } }
  const date = (value?: string) => value ? new Date(value).toLocaleString("en-PH") : "—"
  const paid = bookings.filter((booking) => booking.paid)
  const refunds = bookings.filter((booking) => booking.refund)
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  if (section.dataKey === "overview") {
    const pendingPayouts = withdrawals.filter((r) => r.status === "Pending")
    const pendingRefunds = refunds.filter((b) => b.refund?.status === "Pending")
    const pendingSubscriptions = getSubscriptionPayments().filter((p) => p.status === "Pending")
    const queues: [string, number, string][] = [["Payouts awaiting release", pendingPayouts.length, "/payroll-master/payouts"], ["Refunds awaiting decision", pendingRefunds.length, "/payroll-master/refunds"], ["Subscriptions to verify", pendingSubscriptions.length, "/payroll-master/subscriptions"]]
    return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Client payments" value={peso(sum(paid.map((b) => b.downpayment)))} detail={`${paid.length} paid bookings`} icon={TrendingUp} /><Stat label="Pending payouts" value={peso(sum(pendingPayouts.map((r) => r.amount)))} detail={`${pendingPayouts.length} request${pendingPayouts.length === 1 ? "" : "s"}`} icon={Clock3} /><Stat label="Pending refunds" value={peso(sum(pendingRefunds.map((b) => b.refund!.amount)))} detail={`${pendingRefunds.length} request${pendingRefunds.length === 1 ? "" : "s"}`} icon={XCircle} /><Stat label="Payouts released" value={peso(sum(withdrawals.filter((r) => r.status === "Paid").map((r) => r.amount)))} detail="Sent to providers" icon={CircleDollarSign} /></div><Card><CardHeader><CardTitle>Needs your decision</CardTitle></CardHeader><CardContent className="space-y-2">{queues.map(([label, count, href]) => <Link key={href} href={href} className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-sm hover:bg-muted/60"><span>{label}</span><span className="flex items-center gap-2 font-semibold">{count}<ChevronRight width={14} /></span></Link>)}</CardContent></Card></>
  }
  if (section.dataKey === "payments") return <Card><CardHeader><CardTitle>Client payments</CardTitle><p className="text-sm text-muted-foreground">Downpayments received from clients for their bookings.</p></CardHeader><CardContent>{paid.length ? <Table headers={["Booking", "Client", "Provider", "Amount", "Paid", "Status", "Invoice"]} rows={paid.map((b) => [<span key="id" id={`transaction-${b.id}`} className="scroll-mt-24 font-mono text-xs">{b.id}</span>, b.client, b.provider, peso(b.downpayment), date(b.paidAt), <Status key="status">{b.refund?.status === "Paid" ? "Refunded" : b.status}</Status>, <PaymentReceipt key="receipt" booking={b} />])} /> : <p className="py-10 text-center text-sm text-muted-foreground">No client payments have been recorded.</p>}</CardContent></Card>
  if (section.dataKey === "refunds") return <RefundsPanel admin />
  if (section.dataKey === "disputes") return <AdminReportsPanel />
  if (section.dataKey === "payouts") {
    const pending = withdrawals.filter((request) => request.status === "Pending")
    return <><div className="grid gap-4 sm:grid-cols-3"><Stat label="Pending payouts" value={peso(sum(pending.map((r) => r.amount)))} detail={`${pending.length} request${pending.length === 1 ? "" : "s"}`} icon={Clock3} /><Stat label="Released" value={peso(sum(withdrawals.filter((r) => r.status === "Paid").map((r) => r.amount)))} detail="Sent to providers" icon={CircleDollarSign} /><Stat label="Rejected" value={String(withdrawals.filter((r) => r.status === "Rejected").length)} detail="Declined requests" icon={XCircle} /></div><Card><CardHeader><CardTitle>Provider withdrawal requests</CardTitle><p className="text-sm text-muted-foreground">Send the money manually to the payout account, then mark it as paid.</p></CardHeader><CardContent>{error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}{withdrawals.length ? <div className="space-y-3">{withdrawals.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3"><div><p className="font-medium">{request.provider}</p><p className="mt-1 text-sm text-muted-foreground">{request.payoutMethod} · {request.payoutAccount}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{request.id} · {date(request.requestedAt)}</p></div><div className="flex items-center gap-3"><div className="text-right"><p className="font-semibold">{peso(request.amount)}</p><Status>{request.status}</Status></div>{request.status === "Pending" && <div className="flex gap-2"><Button size="sm" onClick={() => reviewPayout(request.id, "Paid")}>Mark paid</Button><Button size="sm" variant="outline" onClick={() => reviewPayout(request.id, "Rejected")}>Reject</Button></div>}</div></div>)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">No withdrawal requests yet.</p>}</CardContent></Card></>
  }
  if (section.dataKey === "reports") {
    const subscriptions = getSubscriptionPayments().filter((payment) => payment.status === "Paid")
    const months = Array.from(new Set([...paid.map((b) => b.paidAt), ...subscriptions.map((p) => p.paidAt), ...withdrawals.map((w) => w.processedAt), ...refunds.map((b) => b.refund?.processedAt)].filter(Boolean).map((value) => value!.slice(0, 7)))).sort().reverse()
    const inMonth = (month: string, value?: string) => value?.startsWith(month) ?? false
    return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Client payments" value={peso(sum(paid.map((b) => b.downpayment)))} detail={`${paid.length} paid bookings`} icon={TrendingUp} /><Stat label="Subscriptions" value={peso(sum(subscriptions.map((p) => p.amount)))} detail={`${subscriptions.length} confirmed`} icon={ShieldCheck} /><Stat label="Refunds paid" value={peso(sum(refunds.filter((b) => b.refund?.status === "Paid").map((b) => b.refund!.amount)))} detail="Returned to clients" icon={XCircle} /><Stat label="Payouts released" value={peso(sum(withdrawals.filter((w) => w.status === "Paid").map((w) => w.amount)))} detail="Sent to providers" icon={CircleDollarSign} /></div><Card><CardHeader><CardTitle>Totals by month</CardTitle></CardHeader><CardContent>{months.length ? <Table headers={["Month", "Client payments", "Subscriptions", "Refunds", "Payouts"]} rows={months.map((month) => [month, peso(sum(paid.filter((b) => inMonth(month, b.paidAt)).map((b) => b.downpayment))), peso(sum(subscriptions.filter((p) => inMonth(month, p.paidAt)).map((p) => p.amount))), peso(sum(refunds.filter((b) => b.refund?.status === "Paid" && inMonth(month, b.refund.processedAt)).map((b) => b.refund!.amount))), peso(sum(withdrawals.filter((w) => w.status === "Paid" && inMonth(month, w.processedAt)).map((w) => w.amount)))])} /> : <p className="py-10 text-center text-sm text-muted-foreground">No financial activity yet.</p>}</CardContent></Card></>
  }
  if (section.dataKey === "history") {
    const entries = [
      ...paid.map((b) => ({ id: b.id, type: "Client payment", party: b.client, amount: b.downpayment, status: "Paid", at: b.paidAt || b.date })),
      ...refunds.map((b) => ({ id: b.id, type: "Refund", party: b.client, amount: b.refund!.amount, status: b.refund!.status, at: b.refund!.processedAt || b.refund!.requestedAt })),
      ...withdrawals.map((w) => ({ id: w.id, type: "Payout", party: w.provider, amount: w.amount, status: w.status, at: w.processedAt || w.requestedAt })),
      ...getSubscriptionPayments().map((p) => ({ id: p.id, type: "Subscription", party: p.customer, amount: p.amount, status: p.status, at: p.paidAt || p.createdAt })),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    return <><Card><CardHeader><CardTitle>Transactions</CardTitle></CardHeader><CardContent>{entries.length ? <Table headers={["Reference", "Type", "Party", "Amount", "Date", "Status"]} rows={entries.map((e) => [<span key="id" className="font-mono text-xs">{e.id}</span>, e.type, e.party, peso(e.amount), date(e.at), <Status key="status">{e.status}</Status>])} /> : <p className="py-10 text-center text-sm text-muted-foreground">No transactions yet.</p>}</CardContent></Card><AuditPanel /></>
  }
  if (section.dataKey === "subscriptions") return <SubscriptionPayments admin />
  return <Card><CardContent className="py-16 text-center"><p className="font-medium">{section.title} is coming soon</p><p className="mt-1 text-sm text-muted-foreground">This payroll tool is not available yet.</p></CardContent></Card>
}
