import { getAccount, getAccountsForAdmin } from "./client-auth"
import { getAllBookings } from "./client-bookings"
import { getAuditEntries, getSubscriptionPayments } from "./marketplace-billing"
import { getProviderServices } from "./provider-services"
import { getBookingMessages, getProviderReports } from "./communications"
import { getWithdrawalRequests } from "./withdrawals"

export type SystemActivity = { id: string; target: string; category: string; title: string; actor: string; at: string; summary: string; href: string; details: [string, string][] }
const anchor = (path: string, id: string) => `${path}#${encodeURIComponent(id)}`
export function getSystemActivity(): SystemActivity[] {
  if (getAccount()?.role !== "admin") return []
  const records: SystemActivity[] = []
  function add(id: string, target: string, category: string, title: string, actor: string, at: string, summary: string, details: [string, string][], href?: string) {
    records.push({ id, target, category, title, actor, at, summary, details, href: href || anchor("/admin/activity", `activity-${id}`) })
  }
  for (const a of getAccountsForAdmin()) {
    const application = a.application
    add(`account-${a.role}-${a.email}`, a.email, "Accounts", `${a.role === "provider" ? "Provider" : "Client"} account`, `${a.firstName} ${a.lastName}`, "", a.email, [["Name", `${a.firstName} ${a.lastName}`], ["Email", a.email], ["Mobile", a.mobile], ["Role", a.role], ["Business", a.business || "None"]], a.role === "provider" ? anchor("/admin/providers", `activity-provider-${a.email}`) : undefined)
    if (application) add(`application-${a.email}`, a.email, "Providers", "Provider application", a.business || a.email, application.reviewedAt || application.submittedAt, application.status, [["Email", a.email], ["Status", application.status], ["Submitted", application.submittedAt], ["Reviewed", application.reviewedAt || "Pending"], ["Admin notes", application.reason || "None"]], anchor("/admin/providers", `activity-provider-${a.email}`))
  }
  for (const b of getAllBookings()) {
    add(`booking-${b.id}`, b.id, "Bookings", "Booking activity", b.client, b.completedAt || b.cancelledAt || b.paidAt || "", `${b.packageName} / ${b.status}`, [["Booking", b.id], ["Client", b.client], ["Provider", b.provider], ["Service", b.packageName], ["Status", b.status], ["Event date", b.date], ["Time", b.time], ["Venue", b.location], ["Guests", String(b.guests)], ["Duration", `${b.durationDays || 1} days`], ["Notes", b.notes || "None"], ["Total (PHP)", String(b.total)], ["Downpayment (PHP)", String(b.downpayment)], ["Payment", b.paid ? "Paid" : "Unpaid"], ["Method", b.paymentMethod || "Not recorded"], ["Cancelled by", b.cancelledBy || "Not cancelled"]])
    if (b.paid) add(`payment-${b.id}`, b.id, "Payments", "Booking payment", b.client, b.paidAt || "", `${b.downpayment} PHP`, [["Provider", b.provider], ["Method", b.paymentMethod || "Not recorded"]], anchor("/admin/payments", `transaction-${b.id}`))
    if (b.feedback) add(`feedback-${b.id}`, b.id, "Feedback", "Event feedback", b.client, b.feedback.createdAt, `${b.feedback.rating}/5 stars`, [["Booking", b.id], ["Provider", b.provider], ["Rating", String(b.feedback.rating)], ["Feedback", b.feedback.comment]])
    if (b.refund) add(`refund-${b.id}`, b.id, "Refunds", "Refund request", b.client, b.refund.processedAt || b.refund.requestedAt, `${b.refund.status} / ${b.refund.amount} PHP`, [["Booking", b.id], ["Payout", `${b.refund.method} / ${b.refund.account}`], ["Reference", b.refund.reference || "Pending"], ["Reason", b.refund.reason || "None"]], anchor("/admin/refunds", `transaction-RF-${b.id}`))
  }
  for (const s of getProviderServices()) add(`service-${s.id}`, s.id, "Services", "Service listing", s.providerName, "", `${s.name} / ${s.active ? "Active" : "Inactive"}`, [["Service", s.name], ["Provider", s.providerName], ["Description", s.description], ["Price (PHP)", String(s.price)], ["Location", s.location], ["Coverage", s.coverageAreas], ["Active", String(s.active)]])
  for (const m of getBookingMessages()) add(`message-${m.id}`, m.id, "Messages", "Message sent", m.senderName, m.createdAt, `Booking ${m.bookingId}`, [["Booking", m.bookingId], ["Client", m.client], ["Provider", m.provider], ["Sender", m.senderName], ["Message", m.body]])
  for (const r of getProviderReports()) add(`report-${r.id}`, r.id, "Reports", "Client report", r.client, r.createdAt, `${r.reason} / ${r.status}`, [["Booking", r.bookingId], ["Details", r.details]], anchor("/admin/reports", `activity-report-${r.id}`))
  for (const p of getSubscriptionPayments()) add(`subscription-${p.id}`, p.id, "Payments", "Subscription payment", p.customer, p.paidAt || p.createdAt, `${p.plan} / ${p.status} / ${p.amount} PHP`, [["Email", p.email], ["Method", p.method], ["Reference", p.reference]], anchor("/admin/payments", `transaction-${p.id}`))
  for (const w of getWithdrawalRequests()) add(`withdrawal-${w.id}`, w.id, "Withdrawals", "Provider withdrawal", w.provider, w.processedAt || w.requestedAt, `${w.status} / ${w.amount} PHP`, [["Email", w.providerEmail], ["Payout", `${w.payoutMethod} / ${w.payoutAccount}`]], anchor("/admin/payments", `transaction-${w.id}`))
  const events = getAuditEntries().map(log => {
    const matches = records.filter(record => record.target === log.target)
    const category = /schedule/i.test(log.action) ? "Schedule" : /refund/i.test(log.action) ? "Refunds" : /feedback/i.test(log.action) ? "Feedback" : /application/i.test(log.action) ? "Providers" : /booking/i.test(log.action) ? "Bookings" : undefined
    const record = matches.find(r => r.category === category) || matches[0]
    const id = `audit-${log.id}`
    return { id, target: log.target, category: category || record?.category || "Administration", title: log.action, actor: log.actor, at: log.at, summary: `${log.before} -> ${log.after}`, href: record?.href || anchor("/admin/activity", `activity-${id}`), details: [["Target", log.target], ["Before", log.before], ["After", log.after], ...(record?.details || [])] as [string, string][] }
  })
  return [...events, ...records].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
}
