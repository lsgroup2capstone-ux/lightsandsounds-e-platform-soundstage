"use client"

import { Eye, ReceiptText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { type Booking, formatPeso } from "@/lib/marketplace/mock-data"

export function PaymentReceiptCard({ booking }: { booking: Booking }) {
  const paidDate = booking.paidAt ? new Date(booking.paidAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Payment recorded"
  return <div className="rounded-lg bg-card p-5 shadow-soft ring-1 ring-foreground/5"><div className="border-b border-dashed border-border pb-4 text-center"><p className="text-xl font-semibold tracking-tight">SOUND<span className="text-primary">STAGE</span></p><p className="mt-1 text-xs text-muted-foreground">Booking invoice receipt</p></div><div className="mt-5 grid gap-4 text-sm">{[["Invoice number", `SI-${booking.id.replace("BK-", "")}`], ["Booking reference", booking.id], ["Payment date", paidDate], ["Client", booking.client || "Client"], ["Service provider", booking.provider], ["Service", booking.packageName], ["Event date", booking.date], ["Event duration", `${booking.durationDays || 1} day${(booking.durationDays || 1) === 1 ? "" : "s"}`], ["Payment method", booking.paymentMethod || "Electronic payment"], ["Payment status", booking.paid ? "Downpayment paid" : "Unpaid"], ["Invoice total", formatPeso(booking.total)], ["Remaining balance", formatPeso(Math.max(0, booking.total - (booking.paid ? booking.downpayment : 0))) ]].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>)}</div><div className="mt-5 flex items-center justify-between border-t border-dashed border-border pt-4"><span className="font-medium">Amount received</span><span className="text-xl font-semibold text-foreground">{formatPeso(booking.downpayment)}</span></div>{booking.status === "Cancelled" && <p className="mt-4 rounded-md bg-warning/10 p-3 text-center text-xs text-warning">{booking.cancelledBy === "provider" ? booking.refund?.status === "Paid" ? "This downpayment has been refunded." : "Provider-cancelled event. This downpayment is eligible for a refund; check the Refunds tab for its status." : "This payment was retained under the non-refundable cancellation policy."}</p>}</div>
}

export function PaymentReceipt({ booking }: { booking: Booking }) {
  if (!booking.paid) return null
  return <Dialog><DialogTrigger render={<Button type="button" size="sm" variant="outline"><Eye width={15} />Invoice receipt</Button>} /><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><ReceiptText width={20} className="text-primary" />Invoice receipt</DialogTitle></DialogHeader><PaymentReceiptCard booking={booking} /></DialogContent></Dialog>
}
