"use client"

import { useEffect, useState } from "react"
import { Check, CircleDollarSign, ClipboardList, Clock3, ImagePlus, TrendingUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { peso, providerBookings, type AnySection } from "@/lib/data/hub-data"
import { getAccount, updateProviderAccount, type ClientAccount } from "@/lib/auth/client-auth"
import { getProviderServices, saveProviderService, updateProviderServices, type ProviderService } from "@/lib/marketplace/provider-services"
import { getClientBookings } from "@/lib/booking/client-bookings"
import { categories, statusStyles, type Booking, type ServiceCategory } from "@/lib/marketplace/mock-data"
import { SubscriptionPanel } from "@/components/payment/subscription-panel"
import { PaymentReceipt } from "@/components/payment/payment-receipt"
import { MessagesPanel, ProviderReportsPanel } from "@/components/communications/communication-panels"
import { getCoveredCitiesAndTowns } from "@/lib/booking/coverage-areas"
import { createWithdrawalRequest, getWithdrawalRequests, WITHDRAWALS_UPDATED_EVENT, type WithdrawalRequest } from "@/lib/payments/withdrawals"
import { appStorage, mutate } from "@/lib/data/app-store"
import { ProviderApplications } from "@/components/hubs/admin/provider-applications"
import { publicFileUrl, uploadFile } from "@/lib/data/file-upload"
import { ImageCropper } from "@/components/hubs/shared/image-cropper"
import { RowMenu, Stat, Status, Table } from "@/components/hubs/shared/hub-ui"

function ScheduleContent({ notify }: { notify: (message: string) => void }) {
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [blockedDates, setBlockedDates] = useState<number[]>([])
  const isBlocked = (date: number) => blockedDates.includes(date)
  const confirmBlock = () => {
    if (selectedDate === null) return
    setBlockedDates((dates) => isBlocked(selectedDate) ? dates.filter((date) => date !== selectedDate) : [...dates, selectedDate].sort((a, b) => a - b))
    notify(`August ${selectedDate}, 2026 ${isBlocked(selectedDate) ? "unblocked" : "blocked"}.`)
    setSelectedDate(null)
  }
  return <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]"><Card><CardHeader><CardTitle>August 2026 availability</CardTitle><p className="text-sm text-muted-foreground">Select a date, then confirm to block or unblock it.</p></CardHeader><CardContent><div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">{["S","M","T","W","T","F","S"].map((day) => <span key={day} className="py-2">{day}</span>)}{Array.from({ length: 35 }, (_, index) => { const date = index + 1; return <button type="button" key={date} aria-label={`August ${date}, 2026`} aria-pressed={selectedDate === date} onClick={() => setSelectedDate(date)} className={`rounded-md border p-3 transition-colors hover:border-primary ${isBlocked(date) ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border/60"} ${selectedDate === date ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>{date}</button> })}</div>{selectedDate !== null && <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3"><div><p className="text-sm font-medium">August {selectedDate}, 2026</p><p className="text-xs text-muted-foreground">{isBlocked(selectedDate) ? "This date is currently blocked." : "This date is available."}</p></div><Button size="sm" variant={isBlocked(selectedDate) ? "outline" : "default"} onClick={confirmBlock}>{isBlocked(selectedDate) ? "Confirm unblock" : "Confirm block"}</Button></div>}</CardContent></Card><Card><CardHeader><CardTitle>Upcoming events</CardTitle></CardHeader><CardContent className="space-y-3">{providerBookings.map((booking) => <div key={booking.id} className="rounded-lg border border-border/60 p-3"><div className="flex justify-between"><p className="text-sm font-medium">{booking.date}</p><Status>{booking.status}</Status></div><p className="mt-1 text-xs text-muted-foreground">{booking.package} · {booking.client}</p></div>)}</CardContent></Card></div>
}

function ProviderBookingSchedule({ bookings, notify }: { bookings: Booking[]; notify: (message: string) => void }) {
  const firstDate = bookings.find((booking) => /^\d{4}-\d{2}-\d{2}$/.test(booking.date))?.date
  const initialDate = firstDate ? new Date(`${firstDate}T00:00:00`) : new Date()
  const [monthDate] = useState(initialDate)
  const [blockedDates, setBlockedDates] = useState<string[]>(() => JSON.parse(appStorage.getItem(`soundstage-schedule:${encodeURIComponent(getAccount()?.email.toLowerCase() || "")}`) || "[]"))
  const year = monthDate.getFullYear(), month = monthDate.getMonth()
  const monthLabel = monthDate.toLocaleDateString("en-PH", { month: "long", year: "numeric" })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const isoDate = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const approvedBookings = bookings.filter((booking) => holdsDates(booking))
  const bookedDates = new Set(approvedBookings.flatMap((booking) => bookingDateRange(booking.date, booking.durationDays || 1)))

  async function toggleDate(day: number) { try {
    const date = isoDate(day)
    if (bookedDates.has(date)) return notify("This date already has a client booking.")
    await mutate("toggleScheduleDate", [date])
    setBlockedDates((dates) => dates.includes(date) ? dates.filter((item) => item !== date) : [...dates, date])
    notify(`${date} ${blockedDates.includes(date) ? "unblocked" : "blocked"}.`)
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }

  return <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]"><Card><CardHeader><CardTitle>{monthLabel} schedule</CardTitle><p className="text-sm text-muted-foreground">Approved booking dates are automatically blocked in cyan. Select another date to block or unblock it.</p></CardHeader><CardContent><div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">{["S","M","T","W","T","F","S"].map((day, index) => <span key={`${day}-${index}`} className="py-2">{day}</span>)}{Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1, date = isoDate(day), booked = bookedDates.has(date), blocked = blockedDates.includes(date); return <button type="button" key={date} onClick={() => toggleDate(day)} className={`rounded-md border p-3 transition-colors ${booked ? "border-primary bg-primary/15 text-primary" : blocked ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border/60 hover:border-primary"}`} title={booked ? "Approved client booking" : blocked ? "Blocked" : "Available"}>{day}</button> })}</div></CardContent></Card><Card><CardHeader><CardTitle>Approved bookings</CardTitle></CardHeader><CardContent className="space-y-3">{approvedBookings.length ? approvedBookings.map((booking) => <div key={booking.id} className="rounded-lg border border-primary/30 bg-primary/5 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{booking.date} · {booking.time}</p><Status>{booking.status}</Status></div><p className="mt-1 text-xs text-muted-foreground">{booking.packageName} · {booking.client}</p><p className="mt-1 text-xs text-muted-foreground">{booking.location}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No approved bookings yet.</p>}</CardContent></Card></div>
}

// Booking statuses are lowercase now; legacy capitalized values lowercase to the same names.
const statusOf = (booking: Booking) => String(booking.status).toLowerCase()
const holdsDates = (booking: Booking) => ["confirmed", "in_progress"].includes(statusOf(booking))
type BookingAction = "acceptBooking" | "declineBooking" | "startEvent" | "completeEvent" | "cancelEvent"
const BOOKING_FILTERS = ["all", "pending", "awaiting_payment", "confirmed", "in_progress", "completed", "declined", "cancelled", "refund_pending", "refunded"]

function ProviderBookingsContent({ bookings, onAction }: { bookings: Booking[]; onAction: (id: string, action: BookingAction, reason?: string) => void }) {
  const [filter, setFilter] = useState("all")
  const withReason = (id: string, action: BookingAction, question: string) => { const reason = window.prompt(question)?.trim(); if (reason) onAction(id, action, reason) }
  const filtered = bookings.filter(b => filter === "all" || statusOf(b) === filter)
  if (!bookings.length) return <Card><CardHeader><CardTitle>Booking requests</CardTitle></CardHeader><CardContent className="py-12 text-center text-sm text-muted-foreground">No client booking requests yet.</CardContent></Card>
  return <div className="space-y-4"><div className="flex flex-wrap gap-2">{BOOKING_FILTERS.map(status => <Button key={status} size="sm" variant={filter === status ? "default" : "outline"} onClick={() => setFilter(status)}>{status === "all" ? "All" : statusStyles[status as Booking["status"]]?.label || status}</Button>)}</div>{!filtered.length && <p className="py-8 text-muted-foreground">No events with this status.</p>}{filtered.map((booking) => <Card key={booking.id}><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle className="text-lg">{booking.packageName}</CardTitle><p className="mt-1 font-mono text-xs text-muted-foreground">{booking.id}</p></div><Status>{booking.status}</Status></CardHeader><CardContent><div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["Client", booking.client || "Client"], ["Event date", booking.date], ["Event duration", `${booking.durationDays || 1} day${(booking.durationDays || 1) === 1 ? "" : "s"}`], ["Event time", booking.time], ["Event type", booking.eventType || "Not specified"], ["Venue", booking.location], ["Number of guests", String(booking.guests)], ["Package price", peso(booking.total)], ["Downpayment", peso(booking.downpayment)], ["Payment", booking.paid ? "Paid" : "Unpaid"], ["Client notes", booking.notes || "No notes provided"]].map(([label, value]) => <div key={label} className={label === "Client notes" ? "sm:col-span-2 lg:col-span-3" : ""}><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}</div>{booking.feedback && <div className="mt-4 rounded-lg border p-4"><p className="font-medium">Client feedback / {booking.feedback.rating}/5 stars</p><p className="mt-2 whitespace-pre-wrap text-sm">{booking.feedback.comment}</p></div>}{statusOf(booking) === "pending" && <div className="mt-6 flex flex-wrap gap-3 border-t border-border/60 pt-4"><Button onClick={() => onAction(booking.id, "acceptBooking")}><Check width={16} />Accept booking</Button><Button variant="outline" className="text-destructive" onClick={() => withReason(booking.id, "declineBooking", "Why are you declining this booking?")}><X width={16} />Decline</Button></div>}{statusOf(booking) === "awaiting_payment" && <p className="mt-4 text-sm text-muted-foreground">Accepted. Waiting for the client's downpayment.</p>}{statusOf(booking) === "confirmed" && <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => onAction(booking.id, "startEvent")}><Clock3 width={16} />Start event</Button><Button variant="outline" className="text-destructive" onClick={() => withReason(booking.id, "cancelEvent", "Why are you cancelling this event? Paid clients can request a refund.")}>Cancel event</Button></div>}{statusOf(booking) === "in_progress" && <Button className="mt-4" onClick={() => onAction(booking.id, "completeEvent")}><Check width={16} />Mark event completed</Button>}</CardContent></Card>)}</div>
}

function bookingDateRange(startDate: string, durationDays: number) { const start = new Date(`${startDate}T00:00:00`); return Array.from({ length: durationDays }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` }) }

function MovableProviderSchedule({ bookings, notify }: { bookings: Booking[]; notify: (message: string) => void }) {
  const firstBookingDate = bookings.find((booking) => /^\d{4}-\d{2}-\d{2}$/.test(booking.date))?.date
  const [visibleMonth, setVisibleMonth] = useState(() => firstBookingDate ? new Date(`${firstBookingDate}T00:00:00`) : new Date())
  const readBlockedDates = (): string[] => { try { return JSON.parse(appStorage.getItem(`soundstage-schedule:${encodeURIComponent(getAccount()?.email.trim().toLowerCase() || "")}`) || "[]") } catch { return [] } }
  const [blockedDates, setBlockedDates] = useState<string[]>(readBlockedDates)
  useEffect(() => { const sync = () => setBlockedDates(readBlockedDates()); sync(); window.addEventListener("soundstage-account-updated", sync); return () => window.removeEventListener("soundstage-account-updated", sync) }, [])
  const year = visibleMonth.getFullYear(), month = visibleMonth.getMonth()
  const monthLabel = visibleMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const approvedBookings = bookings.filter((booking) => holdsDates(booking))
  const bookedDates = new Set(approvedBookings.flatMap((booking) => bookingDateRange(booking.date, booking.durationDays || 1)))
  const isoDate = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const moveMonth = (amount: number) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))

  const [pendingDate, setPendingDate] = useState<string | null>(null)

  function requestToggle(day: number) {
    const date = isoDate(day)
    if (date < todayIso) return notify("Past dates can't be changed.")
    if (bookedDates.has(date)) return notify("This date is blocked by an approved client booking.")
    setPendingDate(date)
  }

  async function toggleDate(date: string) { try {
    setPendingDate(null)
    const isBlocked = blockedDates.includes(date)
    await mutate("toggleScheduleDate", [date])
    setBlockedDates((dates) => isBlocked ? dates.filter((item) => item !== date) : [...dates, date])
    notify(`${date} ${isBlocked ? "unblocked" : "blocked"}.`)
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }

  const visibleBookings = approvedBookings.filter((booking) => {
    const date = new Date(`${booking.date}T00:00:00`)
    return date.getFullYear() === year && date.getMonth() === month
  })

  return <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle>{monthLabel} schedule</CardTitle><p className="mt-1 text-sm text-muted-foreground">Approved bookings are blocked automatically in cyan.</p></div>
          <div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => moveMonth(-1)} aria-label="Previous month">Previous</Button><Button type="button" size="sm" variant="ghost" onClick={() => setVisibleMonth(new Date())}>Today</Button><Button type="button" size="sm" variant="outline" onClick={() => moveMonth(1)} aria-label="Next month">Next</Button></div>
        </div>
      </CardHeader>
      <CardContent><div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">{["S","M","T","W","T","F","S"].map((day, index) => <span key={`${day}-${index}`} className="py-2">{day}</span>)}{Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1, date = isoDate(day), booked = bookedDates.has(date), blocked = blockedDates.includes(date), past = date < todayIso; return <button type="button" key={date} disabled={past} onClick={() => requestToggle(day)} className={`rounded-md border p-3 transition-colors ${past ? "cursor-not-allowed border-border/40 text-muted-foreground/40" : booked ? "border-primary bg-primary/15 text-primary" : blocked ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border/60 hover:border-primary"}`} title={past ? "Past date" : booked ? "Approved client booking" : blocked ? "Blocked" : "Available"}>{day}</button> })}</div></CardContent>
    </Card>
    <Card><CardHeader><CardTitle>{monthLabel} bookings</CardTitle></CardHeader><CardContent className="space-y-3">{visibleBookings.length ? visibleBookings.map((booking) => <div key={booking.id} className="rounded-lg border border-primary/30 bg-primary/5 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{booking.date} · {booking.time}</p><Status>{booking.status}</Status></div><p className="mt-1 text-xs text-muted-foreground">{booking.packageName} · {booking.client}</p><p className="mt-1 text-xs text-muted-foreground">{booking.location}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No approved bookings this month.</p>}</CardContent></Card>
    {pendingDate && <div role="dialog" aria-modal="true" aria-labelledby="schedule-confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPendingDate(null)} onKeyDown={(event) => { if (event.key === "Escape") setPendingDate(null) }}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h2 id="schedule-confirm-title" className="text-lg font-semibold">{blockedDates.includes(pendingDate) ? "Unblock this date?" : "Block this date?"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{new Date(`${pendingDate}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}{blockedDates.includes(pendingDate) ? " will be open for client bookings again." : " will be unavailable for client bookings."}</p>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPendingDate(null)} autoFocus>Cancel</Button><Button type="button" variant={blockedDates.includes(pendingDate) ? "default" : "destructive"} onClick={() => toggleDate(pendingDate)}>{blockedDates.includes(pendingDate) ? "Unblock" : "Block"}</Button></div>
      </div>
    </div>}
  </div>
}

function ProviderSettings({ account, onSaved, notify }: { account: ClientAccount | null; onSaved: (account: ClientAccount) => void; notify: (message: string) => void }) {
  const [profile, setProfile] = useState({ business: "", firstName: "", lastName: "", email: "", mobile: "", bio: "", profileImage: "" })
  const [error, setError] = useState("")
  useEffect(() => {
    if (account) setProfile({ business: account.business || "", firstName: account.firstName, lastName: account.lastName, email: account.email, mobile: account.mobile, bio: account.bio || "", profileImage: account.profileImage || "" })
  }, [account])

  async function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError("")
    try {
      const key = await uploadFile("profile-image", file)
      setProfile((current) => ({ ...current, profileImage: key }))
    } catch (error) { setError((error as Error).message) }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) { try {
    event.preventDefault()
    const updated = await updateProviderAccount(profile)
    if (!updated) return setError("Provider account could not be found.")
    onSaved(updated)
    notify("Provider profile saved.")
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }

  if (!account) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading profile...</CardContent></Card>
  const initials = `${profile.firstName[0] || ""}${profile.lastName[0] || ""}`.toUpperCase() || "SP"
  return <Card className="max-w-2xl"><CardHeader><CardTitle>Provider profile</CardTitle><p className="text-sm text-muted-foreground">Update your business information and logo.</p></CardHeader><CardContent><form onSubmit={save} className="space-y-5"><div className="flex items-center gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-xl font-semibold text-primary">{publicFileUrl(profile.profileImage) ? <img src={publicFileUrl(profile.profileImage)} alt="Business logo preview" className="h-full w-full object-cover" /> : initials}</div><div><Label htmlFor="businessLogo" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2"><ImagePlus width={16} />Upload business logo</Label><Input id="businessLogo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={selectImage} /><p className="mt-2 text-xs text-muted-foreground">JPG, PNG, or WebP, up to 5MB.</p>{profile.profileImage && <button type="button" className="mt-2 text-xs text-destructive" onClick={() => setProfile((current) => ({ ...current, profileImage: "" }))}>Remove logo</button>}</div></div><div className="grid gap-2"><Label htmlFor="providerBusiness">Business name</Label><Input id="providerBusiness" value={profile.business} onChange={(event) => setProfile({ ...profile, business: event.target.value })} required /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="providerFirstName">First name</Label><Input id="providerFirstName" value={profile.firstName} onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="providerLastName">Last name</Label><Input id="providerLastName" value={profile.lastName} onChange={(event) => setProfile({ ...profile, lastName: event.target.value })} required /></div></div><div className="grid gap-2"><Label htmlFor="providerEmail">Email address</Label><Input id="providerEmail" type="email" readOnly value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="providerMobile">Mobile number</Label><Input id="providerMobile" type="tel" value={profile.mobile} onChange={(event) => setProfile({ ...profile, mobile: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="providerBio">Business description</Label><textarea id="providerBio" value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} rows={4} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Tell clients about your business." /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit">Save profile</Button></form></CardContent></Card>
}

function ProviderServicesContent({ account, notify }: { account: ClientAccount | null; notify: (message: string) => void }) {
  const [services, setServices] = useState<ProviderService[]>([])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ProviderService | null>(null)
  const [image, setImage] = useState("")
  const [cropping, setCropping] = useState<File | null>(null)
  const [providerTown, setProviderTown] = useState("")
  const [error, setError] = useState("")
  useEffect(() => { setServices(getProviderServices("current")) }, [])

  async function selectSetupImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError("")
    setCropping(file)
  }

  async function uploadCropped(file: File) {
    setCropping(null)
    try { setImage(await uploadFile("service-image", file)) } catch (error) { setError((error as Error).message) }
  }

  async function addService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!image) return setError("Upload an image of the setup.")
    const data = new FormData(event.currentTarget)
    if (editing) {
      const areas = getCoveredCitiesAndTowns(providerTown)
      const edited: ProviderService = { ...editing, name: String(data.get("name") || "").trim(), location: areas[0] || providerTown.trim(), coverageAreas: areas.join(", "), description: String(data.get("description") || "").trim(), price: Number(data.get("price")), image, category: String(data.get("category") || editing.category) as ServiceCategory }
      const updated = services.map((service) => service.id === editing.id ? edited : service)
      try { await updateProviderServices(updated) } catch (error) { setError((error as Error).message); return }
      setServices(updated)
      closeForm()
      notify("Service updated.")
      return
    }
    const service: ProviderService = {
      id: `service-${Date.now()}`,
      name: String(data.get("name") || "").trim(),
      location: getCoveredCitiesAndTowns(providerTown)[0] || providerTown.trim(),
      coverageAreas: getCoveredCitiesAndTowns(providerTown).join(", "),
      transportationFee: 1000,
      description: String(data.get("description") || "").trim(),
      price: Number(data.get("price")),
      image,
      providerName: account?.business || `${account?.firstName || "Service"} ${account?.lastName || "Provider"}`,
      active: true,
      bookings: 0,
      category: String(data.get("category") || "Full Production") as ServiceCategory,
    }
    try { await saveProviderService(service) } catch (error) { setError((error as Error).message); return }
    setServices((current) => [service, ...current])
    setAdding(false)
    setImage("")
    setProviderTown("")
    setError("")
    notify("Service added successfully.")
  }

  function closeForm() { setAdding(false); setEditing(null); setImage(""); setProviderTown(""); setError("") }

  function startEdit(service: ProviderService) {
    setEditing(service)
    setAdding(true)
    setImage(service.image)
    setProviderTown(service.coverageAreas || service.location)
    setError("")
  }

  async function deleteService(service: ProviderService) {
    if (!window.confirm(`Delete "${service.name}"? Clients will no longer see this package.`)) return
    const updated = services.filter((item) => item.id !== service.id)
    try { await updateProviderServices(updated) } catch (error) { notify((error as Error).message); return }
    setServices(updated)
    if (editing?.id === service.id) closeForm()
    notify("Service deleted.")
  }

  async function toggleService(index: number) { try {
    const updated = services.map((service, serviceIndex) => serviceIndex === index ? { ...service, active: !service.active } : service)
    setServices(updated)
    await updateProviderServices(updated)
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }

  return <div className="space-y-5">
    <div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold">Service packages</h2><p className="mt-1 text-sm text-muted-foreground">Create the services clients can discover and book.</p></div><Button onClick={() => adding ? closeForm() : (setAdding(true), setError(""))}>{adding ? "Cancel" : "Add service"}</Button></div>
    {adding && <Card><CardHeader><CardTitle>{editing ? "Edit service" : "Add a service"}</CardTitle></CardHeader><CardContent><form key={editing?.id || "new"} onSubmit={addService} className="grid gap-5">
      <div className="grid gap-2"><Label htmlFor="serviceName">Name of service</Label><Input id="serviceName" name="name" defaultValue={editing?.name} placeholder="Wedding Lights and Sounds Package" required /></div>
      <div className="grid gap-2"><Label htmlFor="serviceLocation">Covered cities / towns</Label><Input id="serviceLocation" name="location" value={providerTown} onChange={(event) => setProviderTown(event.target.value)} placeholder="Nasugbu, Lian" required />{providerTown && <div className="flex flex-wrap gap-2">{getCoveredCitiesAndTowns(providerTown).map((area) => <span key={area} className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{area}</span>)}</div>}</div>
      <div className="rounded-lg border border-primary/25 bg-primary/10 p-4"><p className="text-sm font-medium">Transportation fee outside the covered town/city</p><p className="mt-1 text-sm text-muted-foreground">Nearby out-of-area trips start at ₱1,000. Farther cities and provinces cost more, and the booking form calculates the fee automatically.</p></div>
      <div className="grid gap-2"><Label htmlFor="serviceDescription">Description</Label><textarea id="serviceDescription" name="description" defaultValue={editing?.description} rows={4} required className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Describe the equipment, setup, and ideal event size." /></div>
      <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2"><Label htmlFor="serviceCategory">Category</Label><select id="serviceCategory" name="category" required defaultValue={editing?.category || ""} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="" disabled>Select a category</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      <div className="grid gap-2"><Label htmlFor="servicePrice">Price</Label><div className="relative"><Input id="servicePrice" name="price" defaultValue={editing?.price} type="number" min="1" step="1" placeholder="25000" required className="pr-10 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-muted-foreground">₱</span></div></div>
      </div>
      <div className="grid gap-2"><Label htmlFor="setupImage">Image of the setup</Label><label htmlFor="setupImage" className="flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-card/50 p-6 text-center hover:border-primary/50">{publicFileUrl(image) ? <img src={publicFileUrl(image)} alt="Setup preview" className="aspect-video w-full rounded-md object-cover" /> : <><ImagePlus className="text-primary" width={24} /><span className="mt-2 text-sm font-medium">Upload setup image</span><span className="mt-1 text-xs text-muted-foreground">JPG, PNG, or WebP up to 5MB</span></>}<input id="setupImage" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={selectSetupImage} /></label></div>{cropping ? <ImageCropper file={cropping} onCancel={() => setCropping(null)} onCrop={uploadCropped} /> : null}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" className="w-fit">{editing ? "Save changes" : "Publish service"}</Button>
    </form></CardContent></Card>}
    {services.length ? <Card><CardContent className="p-0"><Table headers={["Service", "Covered town/city", "Transport fee", "Price", "Visibility"]} rows={services.map((service, index) => [<span className="font-medium">{service.name}</span>, service.coverageAreas || service.location, "From ₱1,000", peso(service.price), <button onClick={() => toggleService(index)}><Status>{service.active ? "Active" : "Paused"}</Status></button>])} menu={(index) => <RowMenu items={[{ label: "Edit", onSelect: () => startEdit(services[index]) }, { label: "Delete", destructive: true, onSelect: () => deleteService(services[index]) }]} />} /></CardContent></Card> : !adding && <Card><CardContent className="py-12 text-center"><p className="font-medium">No services yet</p><p className="mt-1 text-sm text-muted-foreground">Select Add service to publish your first package.</p></CardContent></Card>}
  </div>
}

export function ProviderContent({ section, notify }: { section: AnySection; notify: (message: string) => void }) {
  const [bookingState, setBookingState] = useState<Booking[]>([])
  const [account, setAccount] = useState<ClientAccount | null>(null)
  const [serviceCount, setServiceCount] = useState(0)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [payoutMethod, setPayoutMethod] = useState("GCash")
  const [payoutName, setPayoutName] = useState("")
  const [payoutNumber, setPayoutNumber] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const isCard = payoutMethod === "Card"
  const cardDigits = payoutNumber.replace(/\D/g, "")
  const expiryValid = /^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry) && new Date(2000 + Number(cardExpiry.slice(3)), Number(cardExpiry.slice(0, 2))) > new Date()
  const payoutValid = payoutName.trim().length >= 2 && (isCard ? cardDigits.length >= 13 && cardDigits.length <= 19 && expiryValid && /^\d{3,4}$/.test(cardCvv) : payoutNumber.replace(/\D/g, "").length >= 6)
  useEffect(() => { const refresh = () => setAccount(getAccount()); refresh(); window.addEventListener("soundstage-account-updated", refresh); window.addEventListener("storage", refresh); return () => { window.removeEventListener("soundstage-account-updated", refresh); window.removeEventListener("storage", refresh) } }, [])
  useEffect(() => {
    if (!account) return
    const loadBookings = () => setBookingState(getClientBookings().filter((booking) => booking.provider === (account.business || `${account.firstName} ${account.lastName}`)))
    loadBookings()
    window.addEventListener("soundstage-bookings-updated", loadBookings)
    window.addEventListener("storage", loadBookings)
    return () => { window.removeEventListener("soundstage-bookings-updated", loadBookings); window.removeEventListener("storage", loadBookings) }
  }, [account])
  useEffect(() => { const loadServices = () => setServiceCount(getProviderServices("current").filter((service) => service.active).length); loadServices(); window.addEventListener("soundstage-services-updated", loadServices); return () => window.removeEventListener("soundstage-services-updated", loadServices) }, [])
  useEffect(() => { const load = () => setWithdrawals(getWithdrawalRequests()); load(); window.addEventListener(WITHDRAWALS_UPDATED_EVENT, load); return () => window.removeEventListener(WITHDRAWALS_UPDATED_EVENT, load) }, [])
  const confirmedBookings = bookingState.filter((booking) => holdsDates(booking))
  const pendingBookings = bookingState.filter((booking) => ["pending", "accepted", "awaiting_payment"].includes(statusOf(booking)))
  const paidBookings = bookingState.filter((booking) => booking.paid && booking.cancelledBy !== "provider")
  const grossEarnings = paidBookings.reduce((sum, booking) => sum + booking.downpayment, 0)
  const providerWithdrawals = withdrawals.filter((request) => request.providerEmail.toLowerCase() === account?.email.toLowerCase())
  const reservedWithdrawals = providerWithdrawals.filter((request) => request.status !== "Rejected").reduce((sum, request) => sum + request.amount, 0)
  const availableEarnings = Math.max(0, grossEarnings - reservedWithdrawals)
  const pendingEarnings = pendingBookings.filter((booking) => !booking.paid).reduce((sum, booking) => sum + booking.downpayment, 0)
  const bookingMessages: Record<BookingAction, string> = { acceptBooking: "Booking accepted. The client can now pay the downpayment.", declineBooking: "Booking declined.", startEvent: "Event started.", completeEvent: "Event completed. Admin and client have been notified.", cancelEvent: "Event cancelled. Paid clients can request a refund." }
  // Each button maps to one server transition; the list reloads from the server's status.
  const runBookingAction = async (id: string, action: BookingAction, reason?: string) => { try { await mutate(action, reason ? [id, reason] : [id]); window.dispatchEvent(new Event("soundstage-bookings-updated")); notify(bookingMessages[action]) } catch (error) { notify((error as Error).message) } }
  const requestWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => { try {
    event.preventDefault()
    if (!account || availableEarnings <= 0 || !payoutValid) return
    // Only the cardholder name and last four digits are stored; expiry and CVV are never saved.
    const payoutAccount = isCard ? `${payoutName.trim()} · •••• ${cardDigits.slice(-4)}` : `${payoutName.trim()} · ${payoutNumber.trim()}`
    await createWithdrawalRequest({ provider: account.business || `${account.firstName} ${account.lastName}`, providerEmail: account.email, amount: availableEarnings, payoutMethod, payoutAccount })
    setPayoutNumber(""); setCardExpiry(""); setCardCvv("")
    notify("Withdrawal request sent to the administrator.")
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }
  if (!account) return <p>Loading provider account...</p>
  if (section.dataKey === "application" || account.application?.status !== "Approved") return <ProviderApplications />
  if (section.dataKey === "overview") return <><div className="grid gap-4 sm:grid-cols-3"><Stat label="This month" value={peso(availableEarnings)} detail={`${confirmedBookings.length} approved booking${confirmedBookings.length === 1 ? "" : "s"}`} icon={TrendingUp} /><Stat label="Active bookings" value={String(confirmedBookings.length)} detail={`${pendingBookings.length} awaiting response`} icon={ClipboardList} /><Stat label="Published services" value={String(serviceCount)} detail={serviceCount ? "Visible to clients" : "Add your first service"} icon={CircleDollarSign} /></div><Card><CardHeader><CardTitle>Business activity</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">You have {bookingState.length} total booking request{bookingState.length === 1 ? "" : "s"}, {confirmedBookings.length} approved date{confirmedBookings.length === 1 ? "" : "s"}, and {serviceCount} active service{serviceCount === 1 ? "" : "s"}.</p></CardContent></Card></>
  if (section.dataKey === "bookings") return <ProviderBookingsContent bookings={bookingState} onAction={runBookingAction} />
  if (section.dataKey === "messages") return <MessagesPanel bookings={bookingState} side="provider" />
  if (section.dataKey === "provider-reports") return <ProviderReportsPanel provider={account?.business || (account ? `${account.firstName} ${account.lastName}` : "")} />
  if (section.dataKey === "schedule") return <MovableProviderSchedule bookings={bookingState} notify={notify} />
  if (section.dataKey === "services") return <ProviderServicesContent account={account} notify={notify} />
  if (section.dataKey === "subscription") return <SubscriptionPanel />
  if (section.dataKey === "earnings") return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Stat label="Available to withdraw" value={peso(availableEarnings)} detail="Held by the administrator" icon={CircleDollarSign} /><Stat label="Pending earnings" value={peso(pendingEarnings)} detail={`From ${pendingBookings.length} pending request${pendingBookings.length === 1 ? "" : "s"}`} icon={Clock3} /><Stat label="Lifetime earnings" value={peso(grossEarnings)} detail="All client downpayments" icon={TrendingUp} /></div><div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]"><Card><CardHeader><CardTitle>Request withdrawal</CardTitle><p className="text-sm text-muted-foreground">The administrator will send the money manually using these payout details.</p></CardHeader><CardContent><form className="space-y-4" onSubmit={requestWithdrawal}><div className="grid gap-2"><Label htmlFor="payoutMethod">Payout method</Label><select id="payoutMethod" value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option>GCash</option><option>Maya</option><option>Card</option></select></div><div className="grid gap-2"><Label htmlFor="payoutName">{isCard ? "Name on card" : "Account name"}</Label><Input id="payoutName" value={payoutName} onChange={(event) => setPayoutName(event.target.value)} placeholder="Juan Dela Cruz" autoComplete={isCard ? "cc-name" : "name"} required /></div><div className="grid gap-2"><Label htmlFor="payoutNumber">{isCard ? "Card number" : "Account number"}</Label><Input id="payoutNumber" value={payoutNumber} onChange={(event) => setPayoutNumber(isCard ? event.target.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ") : event.target.value)} placeholder={isCard ? "1234 5678 9012 3456" : "09XXXXXXXXX"} inputMode="numeric" autoComplete={isCard ? "cc-number" : "off"} required /></div>{isCard && <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="cardExpiry">Expiration date</Label><Input id="cardExpiry" value={cardExpiry} onChange={(event) => { const d = event.target.value.replace(/\D/g, "").slice(0, 4); setCardExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d) }} placeholder="MM/YY" inputMode="numeric" autoComplete="cc-exp" required /></div><div className="grid gap-2"><Label htmlFor="cardCvv">CVV</Label><Input id="cardCvv" type="password" value={cardCvv} onChange={(event) => setCardCvv(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="123" inputMode="numeric" autoComplete="cc-csc" required /></div></div>}<div className="rounded-lg border border-border bg-muted/30 p-3 text-sm"><span className="text-muted-foreground">Withdrawal amount</span><strong className="float-right">{peso(availableEarnings)}</strong></div><Button type="submit" className="w-full" disabled={availableEarnings <= 0 || !payoutValid}>{availableEarnings > 0 ? "Request full withdrawal" : "No balance available"}</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Withdrawal history</CardTitle></CardHeader><CardContent>{providerWithdrawals.length ? <div className="space-y-3">{providerWithdrawals.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3"><div><p className="font-mono text-xs">{request.id}</p><p className="mt-1 text-sm text-muted-foreground">{request.payoutMethod} · {request.payoutAccount}</p></div><div className="text-right"><p className="font-semibold">{peso(request.amount)}</p><Status>{request.status}</Status></div></div>)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">No withdrawal requests yet.</p>}</CardContent></Card></div><Card><CardHeader><CardTitle>Earnings activity</CardTitle></CardHeader><CardContent>{paidBookings.length ? <div className="space-y-3">{paidBookings.map((booking) => <div key={booking.id} className="flex items-center justify-between gap-4 border-b border-border/60 pb-3"><div><p className="text-sm font-medium">{booking.packageName}</p><p className="mt-1 text-xs text-muted-foreground">{booking.id} · {booking.client}</p></div><div className="text-right"><p className="font-semibold">{peso(booking.downpayment)}</p><p className="text-xs text-success">Received by admin</p><div className="mt-2"><PaymentReceipt booking={booking} /></div></div></div>)}</div> : <div className="py-10 text-center"><p className="font-medium">No earnings yet</p><p className="mt-1 text-sm text-muted-foreground">Paid booking downpayments will appear here.</p></div>}</CardContent></Card></div>
  return <ProviderSettings account={account} onSaved={setAccount} notify={notify} />
}
