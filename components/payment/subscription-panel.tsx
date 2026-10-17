"use client"

import { PaymentMethodPicker } from "@/components/payment/payment-method-picker"
import { openPaymentWindow } from "@/lib/booking/payment-window"
import { mutate } from "@/lib/data/app-store"
import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { getAccount } from "@/lib/auth/client-auth"
import { ensureProviderTrial, getAuditEntries, getSubscriptionPayments, MARKETPLACE_EVENT, plans, reviewSubscriptionPayment, submitSubscriptionPayment, subscriptionStatus, type Subscription, type SubscriptionPayment } from "@/lib/payments/marketplace-billing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { peso } from "@/lib/data/hub-data"

function useBillingRefresh() {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const refresh = () => setVersion(v => v + 1)
    window.addEventListener(MARKETPLACE_EVENT, refresh); window.addEventListener("storage", refresh)
    const timer = window.setInterval(refresh, 60000)
    return () => { window.removeEventListener(MARKETPLACE_EVENT, refresh); window.removeEventListener("storage", refresh); window.clearInterval(timer) }
  }, [])
  return version
}
const date = (value: string) => new Date(value).toLocaleString("en-PH")

export function SubscriptionReceipt({ payment }: { payment: SubscriptionPayment }) {
  return <Dialog><DialogTrigger render={<Button variant="outline" size="sm">Invoice receipt</Button>} /><DialogContent><DialogHeader><DialogTitle>Invoice receipt</DialogTitle></DialogHeader><div className="space-y-3 text-sm"><p className="font-bold">SOUNDSTAGE</p>{[["Invoice number", payment.invoice], ["Customer", payment.customer], ["Email", payment.email], ["Description", `${payment.plan} subscription — 30 days`], ["Payment received", payment.paidAt && date(payment.paidAt)], ["Method", payment.method], ["Reference", payment.reference], ["Status", payment.status], ["Total received (PHP)", peso(payment.amount)]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b pb-2"><span>{label}</span><span className="break-all text-right">{value}</span></div>)}</div></DialogContent></Dialog>
}

export function SubscriptionPayments({ admin = false }: { admin?: boolean }) {
  const version = useBillingRefresh()
  const [payments, setPayments] = useState<SubscriptionPayment[]>([])
  const [error, setError] = useState("")
  useEffect(() => setPayments(getSubscriptionPayments()), [version])
  async function review(id: string, status: "Paid" | "Rejected") { try { await reviewSubscriptionPayment(id, status); setError("") } catch (e) { setError((e as Error).message) } }
  return <Card><CardHeader><CardTitle>Subscription payments and invoice receipts</CardTitle>{admin && <p className="text-sm text-muted-foreground">Verify the transfer in your payment account before confirming receipt.</p>}</CardHeader><CardContent className="space-y-4">{error && <p role="alert">{error}</p>}{!payments.length && <p className="text-sm text-muted-foreground">No subscription payments yet. An invoice receipt is available after payment confirmation.</p>}{payments.map(p => <div key={p.id} id={`transaction-${p.id}`} className="scroll-mt-24 flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div><p className="font-medium">{p.customer} · {p.plan} · {peso(p.amount)}</p><p className="text-sm text-muted-foreground">{p.method} · {p.reference} · {date(p.createdAt)}</p><p className="text-sm">{p.status}</p></div>{p.status === "Paid" && <SubscriptionReceipt payment={p} />}{admin && p.status === "Pending" && <div className="flex gap-2"><Button onClick={() => review(p.id, "Paid")}>Confirm received</Button><Button variant="outline" onClick={() => review(p.id, "Rejected")}>Reject</Button></div>}</div>)}</CardContent></Card>
}

export function SubscriptionPanel() {
  const version = useBillingRefresh()
  const [subscription, setSubscription] = useState<Subscription>()
  const [selected, setSelected] = useState("Starter")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)
  useEffect(() => { const account = getAccount(); if (account?.role === "provider") setSubscription(ensureProviderTrial(account.email)); setPending(getSubscriptionPayments().some(p => p.status === "Pending")) }, [version])
  const status = subscription && subscriptionStatus(subscription)
  return <div className="space-y-5"><Card><CardHeader><CardTitle>{status === "Trial" ? "Your 7-day free trial" : status === "Active" ? `${subscription?.plan} subscription` : "Trial expired"}</CardTitle></CardHeader><CardContent><p>{subscription ? status === "Trial" ? `${Math.ceil((Date.parse(subscription.trialEnd) - Date.now()) / 86400000)} days remaining. Ends ${date(subscription.trialEnd)}.` : status === "Active" ? `Paid access until ${date(subscription.paidUntil!)}.` : "Choose a plan and submit payment to continue your subscription." : "Loading subscription…"}</p><p className="mt-2 text-sm text-muted-foreground">No automatic charges. Confirmed payments add 30 days after your current trial or paid period.</p></CardContent></Card><div className="grid gap-4 md:grid-cols-3">{plans.map(plan => <Card key={plan.name} className={selected === plan.name ? "border-primary" : ""}><CardHeader><CardTitle>{plan.name}</CardTitle><p className="text-2xl font-bold">{peso(plan.amount)}<span className="text-sm font-normal"> / 30 days</span></p><p className="text-sm text-muted-foreground">{plan.description}</p></CardHeader><CardContent className="space-y-3">{plan.features.map(feature => <p key={feature} className="flex gap-2 text-sm"><Check className="shrink-0 text-success" width={16} aria-hidden="true" />{feature}</p>)}<Button className="mt-3 w-full" variant={selected === plan.name ? "default" : "outline"} onClick={() => setSelected(plan.name)}>{selected === plan.name ? "Selected" : "Choose plan"}</Button></CardContent></Card>)}</div><SubscriptionCheckout key={selected} planName={selected} disabled={pending || !subscription} /><SubscriptionPayments /></div>
}

function SubscriptionCheckout({ planName, disabled }: { planName: string; disabled: boolean }) {
  const [step, setStep] = useState(1)
  const [method, setMethod] = useState("GCash QR")
  const [payment, setPayment] = useState<SubscriptionPayment>()
  const [error, setError] = useState("")
  const [checkoutUrl, setCheckoutUrl] = useState("")
  const [paying, setPaying] = useState(false)
  const plan = plans.find(p => p.name === planName)!
  return <Card><CardHeader><CardTitle>{step === 3 ? "Payment confirmed" : step === 2 ? "Subscription payment" : "Review subscription"}</CardTitle><p className="text-sm text-muted-foreground">{step < 3 ? `Step ${step} of 3` : "Your subscription is active."}</p></CardHeader><CardContent className="space-y-4">{step === 1 && <><div className="space-y-2 rounded-lg border p-4"><p className="font-semibold">{plan.name} subscription</p><p>30 days of access</p><p className="text-2xl font-bold text-primary">{peso(plan.amount)}</p><p className="text-sm text-muted-foreground">Added after your current trial or paid period. No automatic renewal.</p></div><Button disabled={disabled} onClick={() => setStep(2)}>{disabled ? "Awaiting payment verification" : "Continue to PayMongo"}</Button></>}{step === 2 && <><div className="rounded-lg border border-primary/30 bg-primary/10 p-4"><p>Subscription due now</p><p className="text-3xl font-bold">{peso(plan.amount)}</p></div><PaymentMethodPicker value={method} onChange={setMethod} disabled={paying} /><p className="text-xs text-muted-foreground">PayMongo opens in a new tab. Complete your payment there.</p><div className="flex gap-2"><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button disabled={disabled || paying || Boolean(checkoutUrl)} onClick={async () => { if (paying || payment || checkoutUrl) return; let paymentTab: Window | undefined; setPaying(true); try { paymentTab = openPaymentWindow(); const checkout = await mutate<{ checkoutUrl: string }>("createSubscriptionCheckout", [planName, method]); setCheckoutUrl(checkout.checkoutUrl); if (!paymentTab.closed) paymentTab.location.replace(checkout.checkoutUrl) } catch (e) { paymentTab?.close(); setError((e as Error).message) } finally { setPaying(false) } }}>Pay {peso(plan.amount)}</Button></div></>}{step === 3 && payment && <div className="space-y-4"><Check className="text-success" /><p>{payment.plan} subscription payment of {peso(payment.amount)} recorded.</p><p className="break-all text-xs">Reference: {payment.reference}</p><SubscriptionReceipt payment={payment} /></div>}{checkoutUrl && <p role="status" className="text-sm">Checkout is ready. <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open payment tab</a></p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</CardContent></Card>
}

export function AuditPanel() {
  const version = useBillingRefresh()
  const [logs, setLogs] = useState<ReturnType<typeof getAuditEntries>>([])
  const [search, setSearch] = useState("")
  useEffect(() => setLogs(getAuditEntries()), [version])
  const filtered = logs.filter(log => `${log.actor} ${log.action} ${log.target} ${log.before} ${log.after} ${log.at}`.toLowerCase().includes(search.toLowerCase()))
  return <Card><CardHeader><CardTitle>Marketplace audit log</CardTitle><Input aria-label="Search audit logs" placeholder="Search actor, action, target or status" value={search} onChange={e => setSearch(e.target.value)} /></CardHeader><CardContent>{!filtered.length && <p className="py-6 text-sm text-muted-foreground">{logs.length ? "No matching activity." : "No marketplace actions recorded yet."}</p>}{filtered.map(log => <div key={log.id} className="space-y-1 border-b py-4 text-sm"><p className="font-medium">{log.action}</p><p>{log.actor}</p><p className="break-all text-muted-foreground">{log.target}</p><p>{log.before} → {log.after}</p><time dateTime={log.at} className="text-xs text-muted-foreground">{date(log.at)}</time></div>)}</CardContent></Card>
}
