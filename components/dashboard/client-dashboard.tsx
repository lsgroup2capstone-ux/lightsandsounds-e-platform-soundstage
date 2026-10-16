"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CalendarDays, Check, ChevronRight, ImagePlus, MapPin, MessageSquare, ReceiptText, Search, Star, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { type Booking, formatPeso, statusStyles } from "@/lib/mock-data"
import { getClientBookings, updateClientBookingStatus, submitEventFeedback } from "@/lib/client-bookings"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/site/logo"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { PaymentReceipt } from "@/components/payment/payment-receipt"
import { type ClientAccount, getAccount, isLoggedIn, logout, updateClientAccount } from "@/lib/client-auth"
import { ClientReportsPanel, MessagesPanel } from "@/components/communications/communication-panels"
import { getProviderServices } from "@/lib/provider-services"
import { getCoveredCitiesAndTowns } from "@/lib/coverage-areas"

import { EventNotifications } from "@/components/communications/event-notifications"

import { RefundsPanel } from "@/components/payment/refunds-panel"
import { publicFileUrl, uploadFile } from "@/lib/file-upload"

const tabs = ["Overview", "My bookings", "Messages", "Reports", "Payments", "Refunds", "Feedback", "My profile"] as const
type Tab = (typeof tabs)[number] | "Feedback"

function BookingRow({ booking, onCancel }: { booking: Booking; onCancel?: (id: string) => void }) {
  const status = statusStyles[booking.status]
  const listedService = getProviderServices().find((service) => service.id === booking.packageId)
  const coverageAreas = booking.coverageAreas || listedService?.coverageAreas || listedService?.location
  return (
    <div className="rounded-xl border border-border/70 bg-card/50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative h-20 w-full shrink-0 overflow-hidden rounded-lg sm:h-16 sm:w-24">
          <Image src={publicFileUrl(booking.image) || "/placeholder.svg"} alt={booking.packageName} fill sizes="96px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-foreground">{booking.packageName}</p><Badge variant="outline" className={cn("text-[11px]", status.className)}>{status.label}</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">{booking.provider}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><CalendarDays width={13} />{booking.date}</span><span className="inline-flex items-center gap-1"><MapPin width={13} />{booking.location}</span></div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end"><div className="text-right"><p className="text-xs text-muted-foreground">Total</p><p className="font-display font-semibold">{formatPeso(booking.total)}</p></div>{onCancel && ["Pending", "Confirmed"].includes(booking.status) && <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => onCancel(booking.id)}>Cancel booking</Button>}</div>
      </div>
      {!booking.paid && booking.status !== "Cancelled" && booking.paymentMethod?.startsWith("PayMongo:") && <Button asChild variant="outline" className="mt-4"><Link href={`/payment/return?id=${booking.id}`}>Resume or cancel payment</Link></Button>}{booking.cancelledBy === "provider" && booking.paid && <p className="mt-4 text-sm text-primary">Provider cancelled this event. {booking.refund ? `Refund: ${booking.refund.status}.` : "Request your downpayment refund in the Refunds tab."}</p>}<details className="mt-4 border-t border-border/60 pt-4"><summary className="cursor-pointer text-sm font-medium text-primary">View booking details</summary><div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["Booking reference", booking.id], ["Event date", booking.date], ["Event duration", `${booking.durationDays || 1} day${(booking.durationDays || 1) === 1 ? "" : "s"}`], ["Event time", booking.time], ["Event type", booking.eventType || "Not specified"], ["Venue", booking.location], ["Number of guests", String(booking.guests)], ["Provider", booking.provider], ["Covered cities/towns", coverageAreas ? getCoveredCitiesAndTowns(coverageAreas).join(", ") : "Not recorded"], ["Package price", formatPeso(booking.total)], ["Downpayment", formatPeso(booking.downpayment)], ["Payment", booking.paid ? "Paid" : "Unpaid"], ["Notes", booking.notes || "No notes provided"]].map(([label, value]) => <div key={label} className={label === "Notes" ? "sm:col-span-2 lg:col-span-3" : ""}><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}</div>{coverageAreas && <div className="mt-5"><p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Service provider coverage areas</p><div className="flex flex-wrap gap-2">{getCoveredCitiesAndTowns(coverageAreas).map((area) => <span key={area} className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{area}</span>)}</div></div>}</details>
    </div>
  )
}

function Overview({ onTab }: { onTab: (tab: Tab) => void }) {
  const bookings = getClientBookings()
  const active = bookings.filter((b) => b.status === "Confirmed" || b.status === "Pending")
  const total = bookings.reduce((sum, b) => sum + b.total, 0)
  const paid = bookings.filter((b) => b.paid).reduce((sum, b) => sum + b.downpayment, 0)
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/70 bg-card/60"><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Upcoming events</p><CalendarDays className="text-primary" width={18} height={18} /></div><p className="mt-3 font-display text-3xl font-bold text-foreground">{active.length}</p><p className="mt-1 text-xs text-muted-foreground">Confirmed or awaiting provider confirmation</p></CardContent></Card>
        <Card className="border-border/70 bg-card/60"><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Total booked</p><ReceiptText className="text-primary" width={18} height={18} /></div><p className="mt-3 font-display text-3xl font-bold text-foreground">{formatPeso(total)}</p><p className="mt-1 text-xs text-muted-foreground">Across {bookings.length} bookings</p></CardContent></Card>
        <Card className="border-border/70 bg-card/60"><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Paid so far</p><Wallet className="text-success" width={18} height={18} /></div><p className="mt-3 font-display text-3xl font-bold text-foreground">{formatPeso(paid)}</p><p className="mt-1 text-xs text-muted-foreground">Securely processed</p></CardContent></Card>
      </div>
      <Card className="border-border/70 bg-card/60"><CardHeader className="flex-row items-center justify-between"><CardTitle className="font-sans text-lg">Next up</CardTitle>{active.length > 0 && <Button variant="ghost" size="sm" onClick={() => onTab("My bookings")}>View all <ChevronRight width={14} height={14} /></Button>}</CardHeader><CardContent className="pt-0">{active[0] ? <BookingRow booking={active[0]} /> : <div className="py-8 text-center"><p className="font-medium text-foreground">No upcoming bookings</p><p className="mt-1 text-sm text-muted-foreground">Your next confirmed or pending booking will appear here.</p><Button className="mt-4" asChild><Link href="/browse"><Search width={15} height={15} /> Browse services</Link></Button></div>}</CardContent></Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70 bg-card/60"><CardHeader><CardTitle className="font-sans text-lg">Need a provider?</CardTitle></CardHeader><CardContent><p className="text-sm leading-relaxed text-muted-foreground">Browse verified lights and sounds teams across western Batangas and find the right fit for your event.</p><Button className="mt-4" asChild><Link href="/browse"><Search width={15} height={15} /> Browse services</Link></Button></CardContent></Card>
        <Card className="border-border/70 bg-card/60"><CardHeader><CardTitle className="font-sans text-lg">Your event checklist</CardTitle></CardHeader><CardContent><ul className="flex flex-col gap-3 text-sm">{["Book your preferred provider", "Confirm venue access details", "Review payment schedule"].map((item, i) => <li key={item} className="flex items-center gap-3 text-muted-foreground"><span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-xs", i === 0 ? "border-primary bg-primary/15 text-primary" : "border-border")}>{i === 0 ? <Check width={12} height={12} /> : i + 1}</span>{item}</li>)}</ul></CardContent></Card>
      </div>
    </div>
  )
}

function BookingsTab() {
  const [bookings, setBookings] = useState<Booking[]>(() => getClientBookings())
  const [filter, setFilter] = useState("All")
  useEffect(() => { const refresh = () => setBookings(getClientBookings()); window.addEventListener("soundstage-bookings-updated", refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener("soundstage-bookings-updated", refresh); window.removeEventListener("storage", refresh) } }, [])
  async function cancelBooking(id: string) { try { if (!window.confirm("Cancel this booking? The provider will be notified.")) return; await updateClientBookingStatus(id, "Cancelled"); setBookings(getClientBookings()) } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }
  const filtered = filter === "All" ? bookings : bookings.filter((booking) => booking.status === filter)
  return <div className="flex flex-col gap-5"><div className="flex flex-wrap gap-2">{["All", "Confirmed", "Pending", "Completed", "Cancelled"].map((item) => <Button key={item} size="sm" variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)}>{item}</Button>)}</div>{filtered.length > 0 ? filtered.map((booking) => <BookingRow key={booking.id} booking={booking} onCancel={cancelBooking} />) : <Card className="border-border/70 bg-card/60"><CardContent className="py-12 text-center"><p className="font-medium text-foreground">No bookings found</p><p className="mt-1 text-sm text-muted-foreground">Bookings matching this status will appear here.</p>{filter === "All" && <Button className="mt-4" asChild><Link href="/browse"><Search width={15} height={15} /> Browse services</Link></Button>}</CardContent></Card>}</div>
}

function PaymentsTab() {
  const bookings = getClientBookings()
  const paidBookings = bookings.filter((booking) => booking.paid)
  return <Card className="border-border/70 bg-card/60"><CardContent className="py-8">{paidBookings.length > 0 ? <div className="divide-y divide-border/60">{paidBookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center gap-4 p-4 text-left"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success"><Check width={18} height={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">Downpayment · {booking.packageName}</p><p className="mt-1 text-xs text-muted-foreground">{booking.id} · Paid</p></div><p className="font-display font-semibold text-foreground">{formatPeso(booking.downpayment)}</p><PaymentReceipt booking={booking} /></div>)}</div> : <div className="py-4 text-center"><p className="font-medium text-foreground">No payments yet</p><p className="mt-1 text-sm text-muted-foreground">Payment activity will appear after you make a booking.</p></div>}</CardContent></Card>
}

function FeedbackTab() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [message, setMessage] = useState("")
  useEffect(() => {
    const refresh = () => setBookings(getClientBookings().filter(b => b.status === "Completed"))
    refresh()
    window.addEventListener("soundstage-bookings-updated", refresh)
    window.addEventListener("storage", refresh)
    return () => { window.removeEventListener("soundstage-bookings-updated", refresh); window.removeEventListener("storage", refresh) }
  }, [])
  return <div className="space-y-5">{message && <p role="status" className="text-sm">{message}</p>}{!bookings.length && <Card><CardContent className="py-12 text-center text-muted-foreground">You can leave feedback after your provider completes an event.</CardContent></Card>}{bookings.map(booking => <Card key={booking.id}><CardHeader><CardTitle>{booking.packageName}</CardTitle><p className="text-sm text-muted-foreground">{booking.provider} / {booking.date} / {booking.id}</p></CardHeader><CardContent>{booking.feedback ? <div className="space-y-2"><p className="font-medium text-primary">{booking.feedback.rating} / 5 stars</p><p className="whitespace-pre-wrap">{booking.feedback.comment}</p><p className="text-xs text-muted-foreground">Submitted {new Date(booking.feedback.createdAt).toLocaleString()}</p></div> : <form className="space-y-4" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); try { await submitEventFeedback(booking.id, Number(data.get("rating")), String(data.get("comment"))); setMessage("Thank you! Your event feedback has been saved.") } catch (error) { setMessage((error as Error).message) } }}><label className="grid gap-2 text-sm">Event rating<select name="rating" required defaultValue="" className="rounded-md border bg-background p-2"><option value="" disabled>Choose a rating</option>{[5, 4, 3, 2, 1].map(rating => <option key={rating} value={rating}>{rating} {rating === 1 ? "star" : "stars"}</option>)}</select></label><label className="grid gap-2 text-sm">Your feedback<Textarea name="comment" required maxLength={2000} placeholder="How was your event and the provider service?" /></label><Button type="submit"><Star width={16} />Submit feedback</Button></form>}</CardContent></Card>)}</div>
}

function MessagesTab() { return <MessagesPanel bookings={getClientBookings()} side="client" /> }
function ReportsTab() { return <ClientReportsPanel bookings={getClientBookings()} /> }

function ClientProfile({ account, onSaved }: { account: ClientAccount; onSaved: (account: ClientAccount) => void }) {
  const [profile, setProfile] = useState({ firstName: account.firstName, lastName: account.lastName, email: account.email, mobile: account.mobile, profileImage: account.profileImage || "" })
  const [message, setMessage] = useState("")

  async function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setMessage("Uploading picture...")
    try {
      const key = await uploadFile("profile-image", file)
      setProfile((current) => ({ ...current, profileImage: key }))
      setMessage("")
    } catch (error) { setMessage((error as Error).message) }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) { try {
    event.preventDefault()
    const updated = await updateClientAccount(profile)
    if (!updated) return setMessage("Client account could not be found.")
    onSaved(updated)
    setMessage("Profile saved.")
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }

  const initials = `${profile.firstName[0] || ""}${profile.lastName[0] || ""}`.toUpperCase() || "CL"
  return <Card className="max-w-2xl"><CardHeader><CardTitle>Edit profile</CardTitle><p className="text-sm text-muted-foreground">Update your client information and profile picture.</p></CardHeader><CardContent><form onSubmit={save} className="space-y-5"><div className="flex items-center gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xl font-semibold text-primary">{publicFileUrl(profile.profileImage) ? <img src={publicFileUrl(profile.profileImage)} alt="Profile preview" className="h-full w-full object-cover" /> : initials}</div><div><Label htmlFor="clientPhoto" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2"><ImagePlus width={16} />Upload profile picture</Label><Input id="clientPhoto" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={selectImage} /><p className="mt-2 text-xs text-muted-foreground">JPG, PNG, or WebP, up to 5MB.</p>{profile.profileImage && <button type="button" className="mt-2 text-xs text-destructive" onClick={() => setProfile({ ...profile, profileImage: "" })}>Remove picture</button>}</div></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="clientFirstName">First name</Label><Input id="clientFirstName" value={profile.firstName} onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="clientLastName">Last name</Label><Input id="clientLastName" value={profile.lastName} onChange={(event) => setProfile({ ...profile, lastName: event.target.value })} required /></div></div><div className="grid gap-2"><Label htmlFor="clientEmail">Email address</Label><Input id="clientEmail" type="email" readOnly value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="clientMobile">Mobile number</Label><Input id="clientMobile" type="tel" value={profile.mobile} onChange={(event) => setProfile({ ...profile, mobile: event.target.value })} required /></div>{message && <p role="status" className="text-sm text-primary">{message}</p>}<Button type="submit">Save profile</Button></form></CardContent></Card>
}

export function ClientDashboard({ initialTab = "Overview" }: { initialTab?: Tab }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [account, setAccount] = useState<ClientAccount | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login")
      return
    }

    const savedAccount = getAccount()
    if (!savedAccount) {
      void logout()
      router.replace("/login")
      return
    }

    setAccount(savedAccount)
    setAuthChecked(true)
  }, [router])

  if (!authChecked || !account) return null

  const name = account ? `${account.firstName} ${account.lastName}` : "Client"
  const initials = publicFileUrl(account.profileImage) ? <img src={publicFileUrl(account.profileImage)} alt={`${name} profile`} className="h-full w-full rounded-full object-cover" /> : `${account.firstName[0] ?? ""}${account.lastName[0] ?? ""}`.toUpperCase()
  return <div className="flex min-h-dvh flex-col"><header className="relative z-50 border-b border-border/70 bg-background"><div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-6"><Logo href="/browse"/><div className="flex items-center gap-3"><ThemeToggle /><EventNotifications /><Button asChild variant="ghost" size="sm"><Link href="/browse">Browse services</Link></Button><details className="relative"><summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-border/70 bg-card px-2 text-sm"><span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-semibold text-primary">{initials}</span><span className="hidden sm:inline">{name}</span></summary><div className="absolute right-0 top-11 z-[100] w-48 rounded-lg border border-border/70 bg-card p-2 shadow-xl"><button onClick={() => { location.href="/logout" }} className="w-full rounded-md px-2 py-2 text-left text-sm text-destructive">Log out</button></div></details></div></div></header><main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6"><div className="mb-8"><p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">Client dashboard</p><h1 className="mt-2 text-3xl font-bold">Welcome, {account.firstName}.</h1><p className="mt-2 text-muted-foreground">Your account information, bookings, messages, reports, and payments are all in one place.</p></div><div className="mb-6 flex gap-1 overflow-x-auto border-b border-border/70">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={cn("shrink-0 border-b-2 px-4 py-3 text-sm font-medium", tab === item ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>{item}</button>)}</div>{tab === "Overview" && <Overview onTab={setTab}/>} {tab === "My bookings" && <BookingsTab/>} {tab === "Messages" && <MessagesTab/>} {tab === "Reports" && <ReportsTab/>} {tab === "Payments" && <PaymentsTab/>} {tab === "Refunds" && <RefundsPanel/>} {tab === "Feedback" && <FeedbackTab/>} {tab === "My profile" && <ClientProfile account={account} onSaved={setAccount} />}</main></div>
}

export default ClientDashboard

const _unused = [MessageSquare, Separator]
// Keep the dashboard's visual vocabulary aligned with the platform's shared icon set.
void _unused
