"use client"

import { useEffect, useMemo, useState } from "react"
import { Flag, MessageSquare, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Booking } from "@/lib/mock-data"
import { getAccount } from "@/lib/client-auth"
import { getBookingMessages, getProviderReports, sendBookingMessage, submitProviderReport, updateProviderReportStatus, type BookingMessage, type ProviderReport } from "@/lib/communications"

export function MessagesPanel({ bookings, side }: { bookings: Booking[]; side: "client" | "provider" }) {
  const [selectedId, setSelectedId] = useState(bookings[0]?.id || "")
  const [messages, setMessages] = useState<BookingMessage[]>([])
  const [body, setBody] = useState("")
  useEffect(() => { if (!selectedId && bookings[0]) setSelectedId(bookings[0].id) }, [bookings, selectedId])
  useEffect(() => { const load = () => setMessages(getBookingMessages()); load(); window.addEventListener("soundstage-messages-updated", load); return () => window.removeEventListener("soundstage-messages-updated", load) }, [])
  const booking = bookings.find((item) => item.id === selectedId)
  const thread = useMemo(() => messages.filter((message) => message.bookingId === selectedId), [messages, selectedId])

  async function send(event: React.FormEvent) { try {
    event.preventDefault()
    const account = getAccount()
    if (!booking || !account || !body.trim()) return
    await sendBookingMessage({ bookingId: booking.id, client: booking.client, provider: booking.provider, senderRole: side, senderName: side === "provider" ? booking.provider : booking.client, body: body.trim() })
    setBody("")
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }

  if (!bookings.length) return <Empty icon={MessageSquare} text="Messages become available after a client creates a booking." />
  return <div className="grid gap-5 lg:grid-cols-[280px_1fr]"><Card><CardHeader><CardTitle>Conversations</CardTitle></CardHeader><CardContent className="space-y-2">{bookings.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg border p-3 text-left ${selectedId === item.id ? "border-primary bg-primary/10" : "border-border/70"}`}><p className="truncate text-sm font-medium">{side === "client" ? item.provider : item.client}</p><p className="mt-1 text-xs text-muted-foreground">{item.id} · {item.packageName}</p></button>)}</CardContent></Card><Card className="min-h-[440px]"><CardHeader><CardTitle>{side === "client" ? booking?.provider : booking?.client}</CardTitle><p className="text-xs text-muted-foreground">Booking {booking?.id}</p></CardHeader><CardContent className="flex h-[350px] flex-col"><div className="flex-1 space-y-3 overflow-y-auto pr-1">{thread.length ? thread.map((message) => <div key={message.id} className={`flex ${message.senderRole === side ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-xl px-3 py-2 ${message.senderRole === side ? "bg-primary text-primary-foreground" : "bg-muted"}`}><p className="text-xs font-medium opacity-75">{message.senderName}</p><p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p><p className="mt-1 text-[10px] opacity-65">{new Date(message.createdAt).toLocaleString("en-PH")}</p></div></div>) : <p className="py-12 text-center text-sm text-muted-foreground">No messages yet. Start the conversation below.</p>}</div><form onSubmit={send} className="mt-4 flex gap-2"><Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message..." rows={2} maxLength={1000} required /><Button type="submit" size="icon" aria-label="Send message"><Send width={16} /></Button></form></CardContent></Card></div>
}

export function ClientReportsPanel({ bookings }: { bookings: Booking[] }) {
  const [reports, setReports] = useState<ProviderReport[]>([])
  const [notice, setNotice] = useState("")
  useEffect(() => { const load = () => setReports(getProviderReports()); load(); window.addEventListener("soundstage-reports-updated", load); return () => window.removeEventListener("soundstage-reports-updated", load) }, [])
  const account = getAccount()
  const ownReports = reports.filter((report) => report.clientEmail === account?.email)
  async function submit(event: React.FormEvent<HTMLFormElement>) { try {
    event.preventDefault()
    if (!account) return
    const formElement = event.currentTarget
    const form = new FormData(formElement), booking = bookings.find((item) => item.id === form.get("bookingId"))
    if (!booking) return
    await submitProviderReport({ bookingId: booking.id, client: booking.client, clientEmail: account.email, provider: booking.provider, reason: String(form.get("reason")), details: String(form.get("details")) })
    formElement.reset(); setNotice("Report submitted to the provider and platform administrator.")
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }
  if (!bookings.length) return <Empty icon={Flag} text="You can report a service provider after creating a booking." />
  return <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Report a service provider</CardTitle><p className="text-sm text-muted-foreground">The provider and platform administrator will both receive this report.</p></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><div className="grid gap-2"><Label htmlFor="reportBooking">Booking</Label><select id="reportBooking" name="bookingId" required className="h-10 rounded-md border border-input bg-background px-3 text-sm">{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.provider} · {booking.id}</option>)}</select></div><div className="grid gap-2"><Label htmlFor="reportReason">Reason</Label><select id="reportReason" name="reason" required className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option>Service quality</option><option>Late or missed setup</option><option>Package did not match</option><option>Unprofessional conduct</option><option>Payment dispute</option><option>Other</option></select></div><div className="grid gap-2"><Label htmlFor="reportDetails">Details</Label><Textarea id="reportDetails" name="details" rows={5} minLength={10} maxLength={2000} required placeholder="Describe what happened..." /></div>{notice && <p role="status" className="text-sm text-success">{notice}</p>}<Button type="submit"><Flag width={16} />Submit report</Button></form></CardContent></Card><ReportsList reports={ownReports} title="My reports" /></div>
}

export function ProviderReportsPanel({ provider }: { provider: string }) {
  const [reports, setReports] = useState<ProviderReport[]>([])
  useEffect(() => { const load = () => setReports(getProviderReports().filter((report) => report.provider === provider)); load(); window.addEventListener("soundstage-reports-updated", load); return () => window.removeEventListener("soundstage-reports-updated", load) }, [provider])
  return <ReportsList reports={reports} title="Reports about your service" />
}

export function AdminReportsPanel() {
  const [reports, setReports] = useState<ProviderReport[]>([])
  useEffect(() => { const load = () => setReports(getProviderReports()); load(); window.addEventListener("soundstage-reports-updated", load); return () => window.removeEventListener("soundstage-reports-updated", load) }, [])
  return <ReportsList reports={reports} title="Client reports" admin onResolve={async (id) => { try {return await updateProviderReportStatus(id, "Resolved")} catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }} />
}

function ReportsList({ reports, title, admin = false, onResolve }: { reports: ProviderReport[]; title: string; admin?: boolean; onResolve?: (id: string) => void }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-3">{reports.length ? reports.map((report) => <div key={report.id} id={`activity-report-${report.id}`} className="scroll-mt-24 rounded-lg border border-border/70 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{report.reason}</p><p className="mt-1 text-xs text-muted-foreground">{report.id} · Booking {report.bookingId}</p></div><span className={`rounded-full border px-2 py-1 text-xs ${report.status === "Resolved" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}>{report.status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm">{report.details}</p><div className="mt-3 text-xs text-muted-foreground"><p>Provider: {report.provider}</p><p>Client: {report.client}</p><p>Submitted: {new Date(report.createdAt).toLocaleString("en-PH")}</p></div>{admin && report.status === "Pending" && <Button className="mt-3" size="sm" variant="outline" onClick={() => onResolve?.(report.id)}>Mark resolved</Button>}</div>) : <p className="py-10 text-center text-sm text-muted-foreground">No reports have been submitted.</p>}</CardContent></Card>
}

function Empty({ icon: Icon, text }: { icon: typeof MessageSquare; text: string }) { return <Card><CardContent className="py-14 text-center"><Icon className="mx-auto text-muted-foreground" width={28} /><p className="mt-3 text-sm text-muted-foreground">{text}</p></CardContent></Card> }
