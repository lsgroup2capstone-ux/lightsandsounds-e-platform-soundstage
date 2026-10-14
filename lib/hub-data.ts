export type QueueStatus = "Pending" | "Approved" | "Rejected" | "Resolved"

export const providerBookings: { id: string; client: string; package: string; date: string; amount: number; status: string }[] = []

export const providerServices: { name: string; category: string; price: number; bookings: number; active: boolean }[] = []

export const adminProviders = [
  { id: "APP-018", name: "Harborline Events", owner: "Paolo Reyes", location: "Nasugbu", submitted: "Aug 17, 2026", status: "Pending" },
  { id: "APP-017", name: "Tala Stagecraft", owner: "Mika Flores", location: "Lian", submitted: "Aug 15, 2026", status: "Pending" },
  { id: "APP-014", name: "Coastline Sound Co.", owner: "Rico Dela Cruz", location: "Nasugbu", submitted: "Aug 08, 2026", status: "Approved" },
]

export const adminReports = [
  { id: "RPT-203", subject: "Late setup at BK-1033", reporter: "Client account", date: "Aug 16, 2026", status: "Pending" },
  { id: "RPT-201", subject: "Package mismatch", reporter: "Provider account", date: "Aug 12, 2026", status: "Pending" },
  { id: "RPT-198", subject: "Duplicate booking request", reporter: "System", date: "Aug 05, 2026", status: "Resolved" },
]

export const adminPayments = [
  { id: "PAY-8821", booking: "BK-1042", client: "Ana & Marco", provider: "Balayan Beats", amount: 38000, status: "Held" },
  { id: "PAY-8814", booking: "BK-1038", client: "Lian Events", provider: "Lian Luxe Events", amount: 24000, status: "Released" },
  { id: "PAY-8808", booking: "BK-1029", client: "Jomar Cruz", provider: "Coastline Sound", amount: 9500, status: "Held" },
]

export const adminUsers = [
  { name: "Ana Mendoza", email: "ana.mendoza@email.com", role: "Client", joined: "Aug 18, 2026", status: "Active" },
  { name: "Paolo Reyes", email: "paolo@harborline.ph", role: "Provider", joined: "Aug 17, 2026", status: "Pending" },
  { name: "Rico Dela Cruz", email: "rico@coastline.ph", role: "Provider", joined: "Aug 08, 2026", status: "Active" },
  { name: "Mika Flores", email: "mika@talastagecraft.ph", role: "Provider", joined: "Aug 15, 2026", status: "Active" },
]

export const auditLogs = [
  { action: "Provider approved", actor: "Admin: J. Santos", target: "Coastline Sound Co.", time: "Today, 10:42 AM" },
  { action: "Payment released", actor: "Admin: J. Santos", target: "PAY-8814", time: "Yesterday, 4:15 PM" },
  { action: "Report resolved", actor: "Admin: L. Cruz", target: "RPT-198", time: "Aug 05, 2026" },
]

export const monthlyRevenue = [38, 52, 46, 64, 58, 76, 68, 88, 82, 96, 90, 112]

export const hubNav = {
  provider: [
    ["Overview", "/provider"], ["My application", "/provider/application"], ["Bookings", "/provider/bookings"], ["Messages", "/provider/messages"], ["Reports", "/provider/reports"], ["Schedule", "/provider/schedule"], ["Services", "/provider/services"], ["Subscription", "/provider/subscription"], ["Earnings", "/provider/earnings"], ["Settings", "/provider/settings"], ["Log out", "/logout"],
  ],
  admin: [
    ["Overview", "/admin"], ["System activity", "/admin/activity"], ["Providers", "/admin/providers"], ["Users", "/admin/users"], ["Analytics", "/admin/reports/analytics"], ["Audit logs", "/admin/audit-logs"], ["Log out", "/logout"],
  ],
  payroll_master: [
    ["Overview", "/payroll-master"], ["Payments", "/payroll-master/payments"], ["Refunds", "/payroll-master/refunds"], ["Reports & disputes", "/payroll-master/disputes"], ["Payouts", "/payroll-master/payouts"], ["Reports", "/payroll-master/reports"], ["History", "/payroll-master/history"], ["Subscriptions", "/payroll-master/subscriptions"], ["Log out", "/logout"],
  ],
} as const

export const PROVIDER_UNLOCKED_PATHS: readonly string[] = ["/provider/application", "/logout"]
export function isProviderPathLocked(path: string, approved: boolean) { return !approved && path.startsWith("/provider") && !PROVIDER_UNLOCKED_PATHS.includes(path) }

export function peso(value: number) { return "₱" + value.toLocaleString("en-PH") }
export function hubStatus(status: string) {
  if (["Approved", "Confirmed", "Released", "Paid", "Resolved", "Active"].includes(status)) return "bg-success/15 text-success border-success/30"
  if (["Rejected", "Cancelled"].includes(status)) return "bg-destructive/15 text-destructive border-destructive/30"
  return "bg-warning/15 text-warning border-warning/30"
}

export type HubSection = { kind: "provider" | "admin" | "payroll_master"; title: string; description: string; dataKey: string }
export const providerSections: Record<string, HubSection> = {
  "/provider": { kind: "provider", title: "Provider overview", description: "Keep your event business moving from one focused workspace.", dataKey: "overview" },
  "/provider/application": { kind: "provider", title: "My application", description: "Track verification and keep your provider profile complete.", dataKey: "application" },
  "/provider/bookings": { kind: "provider", title: "Bookings", description: "Review requests, confirm dates, and keep clients updated.", dataKey: "bookings" },
  "/provider/messages": { kind: "provider", title: "Messages", description: "Communicate directly with clients about their bookings.", dataKey: "messages" },
  "/provider/reports": { kind: "provider", title: "Reports", description: "Review client reports submitted about your service.", dataKey: "provider-reports" },
  "/provider/schedule": { kind: "provider", title: "Schedule", description: "Manage availability around your upcoming events.", dataKey: "schedule" },
  "/provider/services": { kind: "provider", title: "Services", description: "Manage packages clients can discover and book.", dataKey: "services" },
  "/provider/subscription": { kind: "provider", title: "Subscription", description: "Choose the plan that fits your event pipeline.", dataKey: "subscription" },
  "/provider/earnings": { kind: "provider", title: "Earnings", description: "Track released funds, pending payouts, and withdrawals.", dataKey: "earnings" },
  "/provider/settings": { kind: "provider", title: "Settings", description: "Update your business profile and notification preferences.", dataKey: "settings" },
}
export const adminSections: Record<string, HubSection> = {
  "/admin/activity": { kind: "admin", title: "System activity", description: "View system actions and their full record details.", dataKey: "activity" },
  "/admin": { kind: "admin", title: "Admin overview", description: "A live-looking snapshot of marketplace health and activity.", dataKey: "overview" },
  "/admin/providers": { kind: "admin", title: "Provider approvals", description: "Verify businesses before they join the marketplace.", dataKey: "providers" },
  "/admin/users": { kind: "admin", title: "Users", description: "Search and manage client and provider accounts.", dataKey: "users" },
  "/admin/reports/analytics": { kind: "admin", title: "Analytics", description: "Understand bookings, revenue, and marketplace growth.", dataKey: "analytics" },
  "/admin/audit-logs": { kind: "admin", title: "Audit logs", description: "A transparent record of marketplace administration actions.", dataKey: "audit" },
}
export const payrollSections: Record<string, HubSection> = {
  "/payroll-master": { kind: "payroll_master", title: "Payroll overview", description: "Money decisions, payouts, and financial reporting in one place.", dataKey: "overview" },
  "/payroll-master/payments": { kind: "payroll_master", title: "Payments", description: "Review verified client and subscription payments.", dataKey: "payments" },
  "/payroll-master/refunds": { kind: "payroll_master", title: "Refunds", description: "Decide refund requests and record their references.", dataKey: "refunds" },
  "/payroll-master/disputes": { kind: "payroll_master", title: "Reports & disputes", description: "Review client reports and disputes before deciding refunds.", dataKey: "disputes" },
  "/payroll-master/payouts": { kind: "payroll_master", title: "Payouts", description: "Release provider payouts for completed bookings.", dataKey: "payouts" },
  "/payroll-master/reports": { kind: "payroll_master", title: "Reports", description: "Totals for payments, refunds, and payouts by period.", dataKey: "reports" },
  "/payroll-master/history": { kind: "payroll_master", title: "History", description: "Every transaction, refund, payout, and audit entry.", dataKey: "history" },
  "/payroll-master/subscriptions": { kind: "payroll_master", title: "Subscriptions", description: "Review manual provider subscription payments.", dataKey: "subscriptions" },
}
export const allSections = { ...providerSections, ...adminSections, ...payrollSections }
const matchesHub = (path: string, root: string) => path === root || path.startsWith(`${root}/`)
// Unknown paths fall back to the overview of the hub their prefix belongs to.
export const findSection = (path: string) => allSections[path]
  || (matchesHub(path, "/payroll-master") ? payrollSections["/payroll-master"] : matchesHub(path, "/admin") ? adminSections["/admin"] : providerSections["/provider"])
export type AnySection = ReturnType<typeof findSection>
