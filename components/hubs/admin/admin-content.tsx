"use client"

import { AdminAccounts } from "@/components/hubs/admin/admin-accounts"
import { useEffect, useState } from "react"
import { CircleDollarSign, ClipboardList, Download, Search, ShieldCheck, TrendingUp, Users, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { adminPayments, adminProviders, adminReports, adminUsers, auditLogs, peso, type AnySection } from "@/lib/data/hub-data"
import { getAccountsForAdmin, type ClientAccount } from "@/lib/auth/client-auth"
import { getProviderServices, type ProviderService } from "@/lib/marketplace/provider-services"
import { getClientBookings } from "@/lib/booking/client-bookings"
import { type Booking } from "@/lib/marketplace/mock-data"
import { AuditPanel } from "@/components/payment/subscription-panel"
import { getWithdrawalRequests, WITHDRAWALS_UPDATED_EVENT, type WithdrawalRequest } from "@/lib/payments/withdrawals"
import { SystemActivityPanel } from "@/components/hubs/admin/system-activity"
import { ProviderApplications } from "@/components/hubs/admin/provider-applications"
import { Chart, Stat, Status, Table } from "@/components/hubs/shared/hub-ui"

function LegacyAdminContent({ section, notify }: { section: AnySection; notify: (message: string) => void }) {
  const [providerState, setProviderState] = useState(adminProviders)
  const [reportState, setReportState] = useState(adminReports)
  const [paymentState, setPaymentState] = useState(adminPayments)
  const [query, setQuery] = useState("")
  if (section.dataKey === "overview") return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Gross volume" value="₱1.24M" detail="+24% this month" icon={TrendingUp} /><Stat label="Active providers" value="86" detail="4 pending approval" icon={ShieldCheck} /><Stat label="Bookings" value="142" detail="18 this week" icon={ClipboardList} /><Stat label="Open reports" value="7" detail="2 need attention" icon={XCircle} /></div><div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><Card><CardHeader><CardTitle>Marketplace volume</CardTitle></CardHeader><CardContent><Chart /></CardContent></Card><Card><CardHeader><CardTitle>Queue health</CardTitle></CardHeader><CardContent className="space-y-4">{[["Provider applications", "4 pending", "warning"], ["Payment releases", "8 held", "primary"], ["Reports & disputes", "7 open", "destructive"]].map(([label, value, tone]) => <div key={label} className="flex items-center justify-between border-b border-border/60 pb-3"><span className="text-sm">{label}</span><span className={`text-sm font-semibold text-${tone}`}>{value}</span></div>)}</CardContent></Card></div></>
  if (section.dataKey === "providers") return <Card><CardHeader><CardTitle>Provider applications</CardTitle><p className="text-sm text-muted-foreground">Review documents and approve trusted event businesses.</p></CardHeader><CardContent><Table headers={["Application", "Business", "Owner", "Location", "Submitted", "Status"]} rows={providerState.map((provider) => [<span className="font-mono text-xs">{provider.id}</span>, provider.name, provider.owner, provider.location, provider.submitted, <Status>{provider.status}</Status>])} onAction={(index, action) => { setProviderState((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, status: action === "approve" ? "Approved" : "Rejected" } : item)); notify(action === "approve" ? "Provider approved." : "Provider application rejected.") }} /></CardContent></Card>
  if (section.dataKey === "reports") return <Card><CardHeader><CardTitle>Reports & disputes</CardTitle></CardHeader><CardContent><Table headers={["Reference", "Issue", "Reporter", "Date", "Status"]} rows={reportState.map((report) => [<span className="font-mono text-xs">{report.id}</span>, report.subject, report.reporter, report.date, <Status>{report.status}</Status>])} onAction={(index) => { setReportState((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, status: "Resolved" } : item)); notify("Report marked as resolved.") }} /></CardContent></Card>
  if (section.dataKey === "payments") return <Card><CardHeader><CardTitle>Payment release queue</CardTitle><p className="text-sm text-muted-foreground">Funds held until event completion is confirmed.</p></CardHeader><CardContent><Table headers={["Payment", "Booking", "Client", "Provider", "Amount", "Status"]} rows={paymentState.map((payment) => [<span className="font-mono text-xs">{payment.id}</span>, payment.booking, payment.client, payment.provider, peso(payment.amount), <Status>{payment.status}</Status>])} onAction={(index, action) => { if (action === "approve") { setPaymentState((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, status: "Released" } : item)); notify("Payment released.") } }} /></CardContent></Card>
  if (section.dataKey === "refunds") return <Card><CardHeader><CardTitle>Refund queue</CardTitle><p className="text-sm text-muted-foreground">Cancellation requests awaiting review.</p></CardHeader><CardContent><Table headers={["Reference", "Booking", "Reason", "Amount", "Status"]} rows={[["RF-041", "BK-1067", "Provider unavailable", peso(2850), <Status>Pending</Status>], ["RF-038", "BK-1049", "Event date moved", peso(7200), <Status>Pending</Status>], ["RF-031", "BK-1021", "Duplicate request", peso(4500), <Status>Resolved</Status>]]} onAction={() => notify("Refund decision recorded in mock mode.")} /></CardContent></Card>
  if (section.dataKey === "users") return <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Account directory</CardTitle></div><div className="relative w-64"><Search className="absolute left-3 top-2.5 text-muted-foreground" width={15} /><Input className="pl-9" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} /></div></CardHeader><CardContent><Table headers={["Name", "Email", "Role", "Joined", "Status"]} rows={adminUsers.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())).map((user) => [user.name, user.email, user.role, user.joined, <Status>{user.status}</Status>])} /></CardContent></Card>
  if (section.dataKey === "analytics") return <><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Reporting period</p><div className="mt-2 flex gap-2"><Button size="sm">12 months</Button><Button size="sm" variant="outline">30 days</Button><Button size="sm" variant="outline">7 days</Button></div></div><Button variant="outline" onClick={() => notify("Analytics CSV exported.")}><Download width={15} height={15} />Export CSV</Button></div><div className="grid gap-4 md:grid-cols-3"><Stat label="Conversion rate" value="18.6%" detail="+3.2% vs last period" icon={TrendingUp} /><Stat label="Avg. booking value" value="₱18,420" detail="Across 142 bookings" icon={CircleDollarSign} /><Stat label="Repeat clients" value="34%" detail="Healthy retention signal" icon={Users} /></div><Card><CardHeader><CardTitle>Revenue by month</CardTitle></CardHeader><CardContent><Chart /></CardContent></Card></>
  return <Card><CardHeader><CardTitle>Audit activity</CardTitle><p className="text-sm text-muted-foreground">Every important admin action is recorded here.</p></CardHeader><CardContent className="space-y-1">{auditLogs.map((log) => <div key={log.target} className="flex items-center justify-between border-b border-border/60 py-4"><div><p className="text-sm font-medium">{log.action}</p><p className="mt-1 text-xs text-muted-foreground">{log.actor} · {log.target}</p></div><span className="text-xs text-muted-foreground">{log.time}</span></div>)}</CardContent></Card>
}

export function AdminContent({ section, notify }: { section: AnySection; notify?: (message: string) => void }) {
  const [accounts, setAccounts] = useState<ClientAccount[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<ProviderService[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  useEffect(() => {
    const refresh = () => { setAccounts(getAccountsForAdmin()); setBookings(getClientBookings()); setServices(getProviderServices()); setWithdrawals(getWithdrawalRequests()) }
    refresh()
    window.addEventListener("soundstage-bookings-updated", refresh)
    window.addEventListener("soundstage-services-updated", refresh)
    window.addEventListener("soundstage-account-updated", refresh)
    window.addEventListener(WITHDRAWALS_UPDATED_EVENT, refresh)
    return () => { window.removeEventListener("soundstage-bookings-updated", refresh); window.removeEventListener("soundstage-services-updated", refresh); window.removeEventListener("soundstage-account-updated", refresh); window.removeEventListener(WITHDRAWALS_UPDATED_EVENT, refresh) }
  }, [])
  const clients = accounts.filter((account) => account.role === "client")
  const providers = accounts.filter((account) => account.role === "provider")
  const paidVolume = bookings.filter((booking) => booking.paid).reduce((sum, booking) => sum + booking.downpayment, 0)
  const Empty = ({ message }: { message: string }) => <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">{message}</CardContent></Card>

  if (section.dataKey === "overview") return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Received payments" value={peso(paidVolume)} detail="Client downpayments" icon={CircleDollarSign} /><Stat label="Service providers" value={String(providers.length)} detail={`${services.filter((service) => service.active).length} active services`} icon={ShieldCheck} /><Stat label="Clients" value={String(clients.length)} detail="Registered client accounts" icon={Users} /><Stat label="Bookings" value={String(bookings.length)} detail={`${bookings.filter((booking) => String(booking.status).toLowerCase() === "pending").length} pending`} icon={ClipboardList} /></div><SystemActivityPanel /></>
  if (section.dataKey === "providers") return <ProviderApplications admin />
  if (section.dataKey === "users") return <AdminAccounts accounts={accounts} />
  if (section.dataKey === "analytics") return <div className="grid gap-4 md:grid-cols-3"><Stat label="Bookings" value={String(bookings.length)} detail="All client requests" icon={ClipboardList} /><Stat label="Paid volume" value={peso(paidVolume)} detail="Received downpayments" icon={CircleDollarSign} /><Stat label="Active services" value={String(services.filter((service) => service.active).length)} detail="Provider listings" icon={TrendingUp} /></div>
  if (section.dataKey === "activity") return <SystemActivityPanel detail />
  if (section.dataKey === "audit") return <AuditPanel />
  return <Empty message="No administrator activity has been recorded." />
}
