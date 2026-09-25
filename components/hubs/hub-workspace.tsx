"use client"

import { AdminAccounts } from "./admin-accounts"
import { ClearAppDataButton } from "./clear-app-data-button"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Check, ChevronRight, CircleDollarSign, ClipboardList, Clock3, Download, ImagePlus, Menu, MoreHorizontal, Search, ShieldCheck, TrendingUp, Users, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { adminPayments, adminProviders, adminReports, adminUsers, auditLogs, findSection, hubNav, hubStatus, monthlyRevenue, peso, providerBookings, type AnySection } from "@/lib/hub-data"
import { getAccount, getAccountsForAdmin, updateProviderAccount, type ClientAccount } from "@/lib/client-auth"
import { getProviderServices, saveProviderService, updateProviderServices, type ProviderService } from "@/lib/provider-services"
import { getClientBookings, updateClientBookingStatus } from "@/lib/client-bookings"
import type { Booking } from "@/lib/mock-data"
import { AuditPanel, SubscriptionPanel, SubscriptionPayments } from "@/components/payment/subscription-panel"
import { PaymentReceipt } from "@/components/payment/payment-receipt"
import { AdminReportsPanel, MessagesPanel, ProviderReportsPanel } from "@/components/communications/communication-panels"
import { getCoveredCitiesAndTowns } from "@/lib/coverage-areas"
import { createWithdrawalRequest, getWithdrawalRequests, updateWithdrawalStatus, WITHDRAWALS_UPDATED_EVENT, type WithdrawalRequest } from "@/lib/withdrawals"

import { EventNotifications } from "@/components/communications/event-notifications"

import { RefundsPanel } from "@/components/payment/refunds-panel"
import { appStorage, mutate } from "@/lib/app-store"
import { SystemActivityPanel } from "./system-activity"

import { ProviderApplications } from "./provider-applications"

function Status({ children }: { children: string }) {
  return <Badge variant="outline" className={hubStatus(children)}>{children}</Badge>
}

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof TrendingUp }) {
  return <Card className="border-border/70 bg-card/75"><CardContent className="flex items-start justify-between p-5"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-primary"><Icon width={18} height={18} /></div></CardContent></Card>
}

function Chart() {
  return <div className="flex h-48 items-end gap-2 border-b border-l border-border/70 px-4 pb-3 pt-4">{monthlyRevenue.map((value, index) => <div key={index} className="group flex flex-1 flex-col items-center justify-end gap-2"><div className="w-full rounded-t-sm bg-primary/80 transition-all group-hover:bg-primary" style={{ height: `${value * 1.25}px` }} /><span className="text-[10px] text-muted-foreground">{["S","O","N","D","J","F","M","A","M","J","J","A"][index]}</span></div>)}</div>
}

function Table({ headers, rows, onAction }: { headers: string[]; rows: (string | React.ReactNode)[][]; onAction?: (index: number, action: "approve" | "reject" | "release") => void }) {
  return <div className="overflow-x-auto rounded-lg border border-border/70"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}<th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-border/60">{rows.map((row, index) => <tr key={index} id={typeof row[0] === "string" ? `transaction-${row[0]}` : undefined} className="scroll-mt-24 transition-colors hover:bg-muted/20">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3.5 text-foreground/85">{cell}</td>)}{onAction ? <td className="px-4 py-3.5 text-right"><div className="flex justify-end gap-1"><Button aria-label="Approve" size="icon" variant="ghost" className="h-8 w-8 text-success" onClick={() => onAction(index, "approve")}><Check width={15} height={15} /></Button><Button aria-label="Reject" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onAction(index, "reject")}><X width={15} height={15} /></Button></div></td> : <td className="px-4 py-3.5 text-right"><Button aria-label="More options" size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal width={16} height={16} /></Button></td>}</tr>)}</tbody></table></div>
}

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
  const approvedBookings = bookings.filter((booking) => booking.status === "Confirmed")
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

function ProviderBookingsContent({ bookings, onStatusChange }: { bookings: Booking[]; onStatusChange: (id: string, status: Booking["status"]) => void }) {
  const [filter, setFilter] = useState("All")
  const filtered = bookings.filter(b => filter === "All" || b.status === filter)
  if (!bookings.length) return <Card><CardHeader><CardTitle>Booking requests</CardTitle></CardHeader><CardContent className="py-12 text-center text-sm text-muted-foreground">No client booking requests yet.</CardContent></Card>
  return <div className="space-y-4"><div className="flex flex-wrap gap-2">{["All", "Pending", "Confirmed", "Completed", "Cancelled"].map(status => <Button key={status} size="sm" variant={filter === status ? "default" : "outline"} onClick={() => setFilter(status)}>{status}</Button>)}</div>{!filtered.length && <p className="py-8 text-muted-foreground">No events with this status.</p>}{filtered.map((booking) => <Card key={booking.id}><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle className="text-lg">{booking.packageName}</CardTitle><p className="mt-1 font-mono text-xs text-muted-foreground">{booking.id}</p></div><Status>{booking.status}</Status></CardHeader><CardContent><div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["Client", booking.client || "Client"], ["Event date", booking.date], ["Event duration", `${booking.durationDays || 1} day${(booking.durationDays || 1) === 1 ? "" : "s"}`], ["Event time", booking.time], ["Event type", booking.eventType || "Not specified"], ["Venue", booking.location], ["Number of guests", String(booking.guests)], ["Package price", peso(booking.total)], ["Downpayment", peso(booking.downpayment)], ["Payment", booking.paid ? "Paid" : "Unpaid"], ["Client notes", booking.notes || "No notes provided"]].map(([label, value]) => <div key={label} className={label === "Client notes" ? "sm:col-span-2 lg:col-span-3" : ""}><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}</div>{booking.feedback && <div className="mt-4 rounded-lg border p-4"><p className="font-medium">Client feedback / {booking.feedback.rating}/5 stars</p><p className="mt-2 whitespace-pre-wrap text-sm">{booking.feedback.comment}</p></div>}{booking.status === "Confirmed" && <Button className="mt-4" onClick={() => onStatusChange(booking.id, "Completed")}><Check width={16} />Mark event completed</Button>}{booking.status === "Confirmed" && <Button variant="outline" className="ml-2 mt-4 text-destructive" onClick={() => onStatusChange(booking.id, "Cancelled")}>Cancel event</Button>}{booking.status === "Pending" && <div className="mt-6 flex gap-3 border-t border-border/60 pt-4"><Button onClick={() => onStatusChange(booking.id, "Confirmed")}><Check width={16} />Approve booking</Button><Button variant="outline" className="text-destructive" onClick={() => onStatusChange(booking.id, "Cancelled")}><X width={16} />Decline</Button></div>}</CardContent></Card>)}</div>
}

function bookingDateRange(startDate: string, durationDays: number) { const start = new Date(`${startDate}T00:00:00`); return Array.from({ length: durationDays }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` }) }

function MovableProviderSchedule({ bookings, notify }: { bookings: Booking[]; notify: (message: string) => void }) {
  const firstBookingDate = bookings.find((booking) => /^\d{4}-\d{2}-\d{2}$/.test(booking.date))?.date
  const [visibleMonth, setVisibleMonth] = useState(() => firstBookingDate ? new Date(`${firstBookingDate}T00:00:00`) : new Date())
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const year = visibleMonth.getFullYear(), month = visibleMonth.getMonth()
  const monthLabel = visibleMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const approvedBookings = bookings.filter((booking) => booking.status === "Confirmed")
  const bookedDates = new Set(approvedBookings.flatMap((booking) => bookingDateRange(booking.date, booking.durationDays || 1)))
  const isoDate = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const moveMonth = (amount: number) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))

  async function toggleDate(day: number) { try {
    const date = isoDate(day)
    if (bookedDates.has(date)) return notify("This date is blocked by an approved client booking.")
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
      <CardContent><div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">{["S","M","T","W","T","F","S"].map((day, index) => <span key={`${day}-${index}`} className="py-2">{day}</span>)}{Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1, date = isoDate(day), booked = bookedDates.has(date), blocked = blockedDates.includes(date); return <button type="button" key={date} onClick={() => toggleDate(day)} className={`rounded-md border p-3 transition-colors ${booked ? "border-primary bg-primary/15 text-primary" : blocked ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border/60 hover:border-primary"}`} title={booked ? "Approved client booking" : blocked ? "Blocked" : "Available"}>{day}</button> })}</div></CardContent>
    </Card>
    <Card><CardHeader><CardTitle>{monthLabel} bookings</CardTitle></CardHeader><CardContent className="space-y-3">{visibleBookings.length ? visibleBookings.map((booking) => <div key={booking.id} className="rounded-lg border border-primary/30 bg-primary/5 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{booking.date} · {booking.time}</p><Status>{booking.status}</Status></div><p className="mt-1 text-xs text-muted-foreground">{booking.packageName} · {booking.client}</p><p className="mt-1 text-xs text-muted-foreground">{booking.location}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No approved bookings this month.</p>}</CardContent></Card>
  </div>
}

function ProviderSettings({ account, onSaved, notify }: { account: ClientAccount | null; onSaved: (account: ClientAccount) => void; notify: (message: string) => void }) {
  const [profile, setProfile] = useState({ business: "", firstName: "", lastName: "", email: "", mobile: "", bio: "", profileImage: "" })
  const [error, setError] = useState("")
  useEffect(() => {
    if (account) setProfile({ business: account.business || "", firstName: account.firstName, lastName: account.lastName, email: account.email, mobile: account.mobile, bio: account.bio || "", profileImage: account.profileImage || "" })
  }, [account])

  function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) return setError("Choose a JPG, PNG, or WebP image.")
    if (file.size > 2 * 1024 * 1024) return setError("Business logo must be 2MB or smaller.")
    const reader = new FileReader()
    reader.onload = () => { setProfile((current) => ({ ...current, profileImage: String(reader.result) })); setError("") }
    reader.onerror = () => setError("The selected image could not be read.")
    reader.readAsDataURL(file)
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
  return <Card className="max-w-2xl"><CardHeader><CardTitle>Provider profile</CardTitle><p className="text-sm text-muted-foreground">Update your business information and logo.</p></CardHeader><CardContent><form onSubmit={save} className="space-y-5"><div className="flex items-center gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-xl font-semibold text-primary">{profile.profileImage ? <img src={profile.profileImage} alt="Business logo preview" className="h-full w-full object-cover" /> : initials}</div><div><Label htmlFor="businessLogo" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2"><ImagePlus width={16} />Upload business logo</Label><Input id="businessLogo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={selectImage} /><p className="mt-2 text-xs text-muted-foreground">JPG, PNG, or WebP, up to 2MB.</p>{profile.profileImage && <button type="button" className="mt-2 text-xs text-destructive" onClick={() => setProfile((current) => ({ ...current, profileImage: "" }))}>Remove logo</button>}</div></div><div className="grid gap-2"><Label htmlFor="providerBusiness">Business name</Label><Input id="providerBusiness" value={profile.business} onChange={(event) => setProfile({ ...profile, business: event.target.value })} required /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="providerFirstName">First name</Label><Input id="providerFirstName" value={profile.firstName} onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="providerLastName">Last name</Label><Input id="providerLastName" value={profile.lastName} onChange={(event) => setProfile({ ...profile, lastName: event.target.value })} required /></div></div><div className="grid gap-2"><Label htmlFor="providerEmail">Email address</Label><Input id="providerEmail" type="email" readOnly value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="providerMobile">Mobile number</Label><Input id="providerMobile" type="tel" value={profile.mobile} onChange={(event) => setProfile({ ...profile, mobile: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="providerBio">Business description</Label><textarea id="providerBio" value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} rows={4} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Tell clients about your business." /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit">Save profile</Button></form></CardContent></Card>
}

function ProviderServicesContent({ account, notify }: { account: ClientAccount | null; notify: (message: string) => void }) {
  const [services, setServices] = useState<ProviderService[]>([])
  const [adding, setAdding] = useState(false)
  const [image, setImage] = useState("")
  const [providerTown, setProviderTown] = useState("")
  const [error, setError] = useState("")
  useEffect(() => { setServices(getProviderServices("current")) }, [])

  function selectSetupImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) return setError("Choose a JPG, PNG, or WebP image.")
    if (file.size > 3 * 1024 * 1024) return setError("Setup image must be 3MB or smaller.")
    const reader = new FileReader()
    reader.onload = () => { setImage(String(reader.result)); setError("") }
    reader.onerror = () => setError("The setup image could not be read.")
    reader.readAsDataURL(file)
  }

  async function addService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!image) return setError("Upload an image of the setup.")
    const data = new FormData(event.currentTarget)
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
    }
    try { await saveProviderService(service) } catch (error) { setError((error as Error).message); return }
    setServices((current) => [service, ...current])
    setAdding(false)
    setImage("")
    setProviderTown("")
    setError("")
    notify("Service added successfully.")
  }

  async function toggleService(index: number) { try {
    const updated = services.map((service, serviceIndex) => serviceIndex === index ? { ...service, active: !service.active } : service)
    setServices(updated)
    await updateProviderServices(updated)
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }

  return <div className="space-y-5">
    <div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold">Service packages</h2><p className="mt-1 text-sm text-muted-foreground">Create the services clients can discover and book.</p></div><Button onClick={() => { setAdding((value) => !value); setError("") }}>{adding ? "Cancel" : "Add service"}</Button></div>
    {adding && <Card><CardHeader><CardTitle>Add a service</CardTitle></CardHeader><CardContent><form onSubmit={addService} className="grid gap-5">
      <div className="grid gap-2"><Label htmlFor="serviceName">Name of service</Label><Input id="serviceName" name="name" placeholder="Wedding Lights and Sounds Package" required /></div>
      <div className="grid gap-2"><Label htmlFor="serviceLocation">Covered cities / towns</Label><Input id="serviceLocation" name="location" value={providerTown} onChange={(event) => setProviderTown(event.target.value)} placeholder="Nasugbu, Lian" required /><p className="text-xs text-muted-foreground">Maps display city/town names only. Barangay and province parts are removed.</p>{providerTown && <div className="grid gap-3 sm:grid-cols-2">{getCoveredCitiesAndTowns(providerTown).map((area) => <div key={area} className="overflow-hidden rounded-lg border border-border"><p className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">{area}</p><iframe title={`${area} coverage map`} src={`https://www.google.com/maps?q=${encodeURIComponent(area)}&output=embed`} className="h-56 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>)}</div>}</div>
      <div className="rounded-lg border border-primary/25 bg-primary/10 p-4"><p className="text-sm font-medium">Transportation fee outside the covered town/city</p><p className="mt-1 text-sm text-muted-foreground">Nearby out-of-area trips start at ₱1,000. Farther cities and provinces cost more, and the booking form calculates the fee automatically.</p></div>
      <div className="grid gap-2"><Label htmlFor="serviceDescription">Description</Label><textarea id="serviceDescription" name="description" rows={4} required className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Describe the equipment, setup, and ideal event size." /></div>
      <div className="grid gap-2"><Label htmlFor="servicePrice">Price</Label><Input id="servicePrice" name="price" type="number" min="1" step="1" placeholder="25000" required /></div>
      <div className="grid gap-2"><Label htmlFor="setupImage">Image of the setup</Label><label htmlFor="setupImage" className="flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-card/50 p-6 text-center hover:border-primary/50">{image ? <img src={image} alt="Setup preview" className="max-h-64 w-full rounded-md object-cover" /> : <><ImagePlus className="text-primary" width={24} /><span className="mt-2 text-sm font-medium">Upload setup image</span><span className="mt-1 text-xs text-muted-foreground">JPG, PNG, or WebP up to 3MB</span></>}<input id="setupImage" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={selectSetupImage} /></label></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" className="w-fit">Publish service</Button>
    </form></CardContent></Card>}
    {services.length ? <Card><CardContent className="p-0"><Table headers={["Service", "Covered town/city", "Transport fee", "Price", "Visibility"]} rows={services.map((service, index) => [<span className="font-medium">{service.name}</span>, service.coverageAreas || service.location, "From ₱1,000", peso(service.price), <button onClick={() => toggleService(index)}><Status>{service.active ? "Active" : "Paused"}</Status></button>])} /></CardContent></Card> : !adding && <Card><CardContent className="py-12 text-center"><p className="font-medium">No services yet</p><p className="mt-1 text-sm text-muted-foreground">Select Add service to publish your first package.</p></CardContent></Card>}
  </div>
}

function ProviderContent({ section, notify }: { section: AnySection; notify: (message: string) => void }) {
  const [bookingState, setBookingState] = useState<Booking[]>([])
  const [account, setAccount] = useState<ClientAccount | null>(null)
  const [serviceCount, setServiceCount] = useState(0)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [payoutMethod, setPayoutMethod] = useState("GCash")
  const [payoutAccount, setPayoutAccount] = useState("")
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
  const confirmedBookings = bookingState.filter((booking) => booking.status === "Confirmed")
  const pendingBookings = bookingState.filter((booking) => booking.status === "Pending")
  const paidBookings = bookingState.filter((booking) => booking.paid && booking.cancelledBy !== "provider")
  const grossEarnings = paidBookings.reduce((sum, booking) => sum + booking.downpayment, 0)
  const providerWithdrawals = withdrawals.filter((request) => request.providerEmail.toLowerCase() === account?.email.toLowerCase())
  const reservedWithdrawals = providerWithdrawals.filter((request) => request.status !== "Rejected").reduce((sum, request) => sum + request.amount, 0)
  const availableEarnings = Math.max(0, grossEarnings - reservedWithdrawals)
  const pendingEarnings = pendingBookings.filter((booking) => !booking.paid).reduce((sum, booking) => sum + booking.downpayment, 0)
  const changeBookingStatus = async (id: string, status: Booking["status"]) => { try { await updateClientBookingStatus(id, status); setBookingState((items) => items.map((booking) => booking.id === id ? { ...booking, status } : booking)); notify(status === "Completed" ? "Event completed. Admin and client have been notified." : status === "Confirmed" ? "Booking approved and date blocked." : "Event cancelled. Paid clients can request a refund.") } catch (error) { notify((error as Error).message) } }
  const requestWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => { try {
    event.preventDefault()
    if (!account || availableEarnings <= 0 || !payoutAccount.trim()) return
    await createWithdrawalRequest({ provider: account.business || `${account.firstName} ${account.lastName}`, providerEmail: account.email, amount: availableEarnings, payoutMethod, payoutAccount: payoutAccount.trim() })
    setPayoutAccount("")
    notify("Withdrawal request sent to the administrator.")
  } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }
  if (!account) return <p>Loading provider account...</p>
  if (section.dataKey === "application" || (account.application?.status !== "Approved" && section.dataKey !== "settings")) return <ProviderApplications />
  if (section.dataKey === "overview") return <><div className="grid gap-4 sm:grid-cols-3"><Stat label="This month" value={peso(availableEarnings)} detail={`${confirmedBookings.length} approved booking${confirmedBookings.length === 1 ? "" : "s"}`} icon={TrendingUp} /><Stat label="Active bookings" value={String(confirmedBookings.length)} detail={`${pendingBookings.length} awaiting response`} icon={ClipboardList} /><Stat label="Published services" value={String(serviceCount)} detail={serviceCount ? "Visible to clients" : "Add your first service"} icon={CircleDollarSign} /></div><Card><CardHeader><CardTitle>Business activity</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">You have {bookingState.length} total booking request{bookingState.length === 1 ? "" : "s"}, {confirmedBookings.length} approved date{confirmedBookings.length === 1 ? "" : "s"}, and {serviceCount} active service{serviceCount === 1 ? "" : "s"}.</p></CardContent></Card></>
  if (section.dataKey === "bookings") return <ProviderBookingsContent bookings={bookingState} onStatusChange={changeBookingStatus} />
  if (section.dataKey === "messages") return <MessagesPanel bookings={bookingState} side="provider" />
  if (section.dataKey === "provider-reports") return <ProviderReportsPanel provider={account?.business || (account ? `${account.firstName} ${account.lastName}` : "")} />
  if (section.dataKey === "schedule") return <MovableProviderSchedule bookings={bookingState} notify={notify} />
  if (section.dataKey === "services") return <ProviderServicesContent account={account} notify={notify} />
  if (section.dataKey === "subscription") return <SubscriptionPanel />
  if (section.dataKey === "earnings") return <><div className="grid gap-4 sm:grid-cols-3"><Stat label="Available to withdraw" value={peso(availableEarnings)} detail="Held by the administrator" icon={CircleDollarSign} /><Stat label="Pending earnings" value={peso(pendingEarnings)} detail={`From ${pendingBookings.length} pending request${pendingBookings.length === 1 ? "" : "s"}`} icon={Clock3} /><Stat label="Lifetime earnings" value={peso(grossEarnings)} detail="All client downpayments" icon={TrendingUp} /></div><div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]"><Card><CardHeader><CardTitle>Request withdrawal</CardTitle><p className="text-sm text-muted-foreground">The administrator will send the money manually using these payout details.</p></CardHeader><CardContent><form className="space-y-4" onSubmit={requestWithdrawal}><div className="grid gap-2"><Label htmlFor="payoutMethod">Payout method</Label><select id="payoutMethod" value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option>GCash</option><option>Maya</option><option>Bank transfer</option></select></div><div className="grid gap-2"><Label htmlFor="payoutAccount">Account name and number</Label><Input id="payoutAccount" value={payoutAccount} onChange={(event) => setPayoutAccount(event.target.value)} placeholder="Juan Dela Cruz · 09XXXXXXXXX" required /></div><div className="rounded-lg border border-border bg-muted/30 p-3 text-sm"><span className="text-muted-foreground">Withdrawal amount</span><strong className="float-right">{peso(availableEarnings)}</strong></div><Button type="submit" className="w-full" disabled={availableEarnings <= 0}>{availableEarnings > 0 ? "Request full withdrawal" : "No balance available"}</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Withdrawal history</CardTitle></CardHeader><CardContent>{providerWithdrawals.length ? <div className="space-y-3">{providerWithdrawals.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3"><div><p className="font-mono text-xs">{request.id}</p><p className="mt-1 text-sm text-muted-foreground">{request.payoutMethod} · {request.payoutAccount}</p></div><div className="text-right"><p className="font-semibold">{peso(request.amount)}</p><Status>{request.status}</Status></div></div>)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">No withdrawal requests yet.</p>}</CardContent></Card></div><Card><CardHeader><CardTitle>Earnings activity</CardTitle></CardHeader><CardContent>{paidBookings.length ? <div className="space-y-3">{paidBookings.map((booking) => <div key={booking.id} className="flex items-center justify-between gap-4 border-b border-border/60 pb-3"><div><p className="text-sm font-medium">{booking.packageName}</p><p className="mt-1 text-xs text-muted-foreground">{booking.id} · {booking.client}</p></div><div className="text-right"><p className="font-semibold">{peso(booking.downpayment)}</p><p className="text-xs text-success">Received by admin</p><div className="mt-2"><PaymentReceipt booking={booking} /></div></div></div>)}</div> : <div className="py-10 text-center"><p className="font-medium">No earnings yet</p><p className="mt-1 text-sm text-muted-foreground">Paid booking downpayments will appear here.</p></div>}</CardContent></Card></>
  return <ProviderSettings account={account} onSaved={setAccount} notify={notify} />
}

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

function AdminContent({ section, notify }: { section: AnySection; notify?: (message: string) => void }) {
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

  if (section.dataKey === "overview") return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Received payments" value={peso(paidVolume)} detail="Client downpayments" icon={CircleDollarSign} /><Stat label="Service providers" value={String(providers.length)} detail={`${services.filter((service) => service.active).length} active services`} icon={ShieldCheck} /><Stat label="Clients" value={String(clients.length)} detail="Registered client accounts" icon={Users} /><Stat label="Bookings" value={String(bookings.length)} detail={`${bookings.filter((booking) => booking.status === "Pending").length} pending`} icon={ClipboardList} /></div><SystemActivityPanel /></>
  if (section.dataKey === "providers") return <ProviderApplications admin />
  if (section.dataKey === "users") return <AdminAccounts accounts={accounts} />
  if (section.dataKey === "payments") return <div className="space-y-5"><SubscriptionPayments admin /><Card><CardHeader><CardTitle>Provider withdrawal requests</CardTitle><p className="text-sm text-muted-foreground">Send each payout manually, then mark it as paid. Rejecting a request restores the provider&apos;s available balance.</p></CardHeader><CardContent>{withdrawals.length ? <Table headers={["Request", "Provider", "Payout details", "Amount", "Status"]} rows={withdrawals.map((request) => [<span id={`transaction-${request.id}`} className="scroll-mt-24 font-mono text-xs">{request.id}</span>, request.provider, `${request.payoutMethod} · ${request.payoutAccount}`, peso(request.amount), <Status>{request.status}</Status>])} onAction={async (index, action) => { try { const request = withdrawals[index]; if (request.status !== "Pending") return; const status = action === "approve" ? "Paid" : "Rejected"; await updateWithdrawalStatus(request.id, status); notify?.(status === "Paid" ? "Withdrawal marked as manually paid." : "Withdrawal rejected and balance restored.") } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }} /> : <p className="py-10 text-center text-sm text-muted-foreground">No provider withdrawal requests.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Client payments held by admin</CardTitle></CardHeader><CardContent>{bookings.filter((booking) => booking.paid).length ? <Table headers={["Booking", "Client", "Provider", "Amount", "Status", "Invoice"]} rows={bookings.filter((booking) => booking.paid).map((booking) => [booking.id, booking.client, booking.provider, peso(booking.downpayment), <Status>Held</Status>, <PaymentReceipt booking={booking} />])} /> : <p className="py-10 text-center text-sm text-muted-foreground">No client payments have been recorded.</p>}</CardContent></Card></div>
  if (section.dataKey === "analytics") return <div className="grid gap-4 md:grid-cols-3"><Stat label="Bookings" value={String(bookings.length)} detail="All client requests" icon={ClipboardList} /><Stat label="Paid volume" value={peso(paidVolume)} detail="Received downpayments" icon={CircleDollarSign} /><Stat label="Active services" value={String(services.filter((service) => service.active).length)} detail="Provider listings" icon={TrendingUp} /></div>
  if (section.dataKey === "reports") return <AdminReportsPanel />
  if (section.dataKey === "refunds") return <RefundsPanel admin />
  if (section.dataKey === "activity") return <SystemActivityPanel detail />
  if (section.dataKey === "audit") return <AuditPanel />
  return <Empty message="No administrator activity has been recorded." />
}

export function HubWorkspace({ initialPath }: { initialPath: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const section = findSection(pathname || initialPath)
  useEffect(() => {
    let observer: MutationObserver | undefined
    const followTransaction = () => {
      observer?.disconnect()
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id.startsWith("transaction-") && !id.startsWith("activity-")) return
      const scroll = () => { const target = document.getElementById(id); if (!target) return false; target.scrollIntoView({ block: "center", behavior: "smooth" }); target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); return true }
      if (!scroll()) { observer = new MutationObserver(() => { if (scroll()) observer?.disconnect() }); observer.observe(document.body, { childList: true, subtree: true }) }
    }
    followTransaction(); window.addEventListener("hashchange", followTransaction)
    return () => { observer?.disconnect(); window.removeEventListener("hashchange", followTransaction) }
  }, [pathname])
  const nav = hubNav[section.kind]
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const [providerAccount, setProviderAccount] = useState<ClientAccount | null>(null)
  const [adminAccount, setAdminAccount] = useState<ClientAccount | null>(null)
  useEffect(() => { const account = getAccount(); if (section.kind === "admin" && account?.role !== "admin") router.replace("/login"); if (section.kind === "provider" && account?.role !== "provider") router.replace("/login") }, [router, section.kind])
  useEffect(() => { if (section.kind === "admin") setAdminAccount(getAccount()) }, [section.kind])
  useEffect(() => {
    if (section.kind !== "provider") return
    const syncProvider = () => setProviderAccount(getAccount())
    syncProvider()
    window.addEventListener("soundstage-account-updated", syncProvider)
    return () => window.removeEventListener("soundstage-account-updated", syncProvider)
  }, [section.kind])
  const providerName = providerAccount?.business || (providerAccount ? `${providerAccount.firstName} ${providerAccount.lastName}` : "Service provider")
  const providerInitials = providerAccount?.profileImage
    ? <img src={providerAccount.profileImage} alt={`${providerName} logo`} className="h-full w-full object-cover" />
    : providerAccount ? `${providerAccount.firstName[0] ?? ""}${providerAccount.lastName[0] ?? ""}`.toUpperCase() : "SP"
  const adminName = adminAccount ? `${adminAccount.firstName} ${adminAccount.lastName}` : "Administrator"
  const adminInitials = adminAccount ? `${adminAccount.firstName[0] ?? ""}${adminAccount.lastName[0] ?? ""}`.toUpperCase() : "AD"
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2400) }
  return <div className="min-h-screen bg-background"><div className="mx-auto flex max-w-[1440px]"><aside className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-border/70 bg-card/95 p-5 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="flex items-center justify-between"><Link href={section.kind === "provider" ? "/provider" : "/admin"} className="font-display text-xl font-bold tracking-tight">SOUND<span className="text-primary">STAGE</span></Link><Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setMobileOpen(false)}><X width={18} /></Button></div><p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{section.kind} hub</p><nav className="mt-4 space-y-1">{nav.map(([label, href]) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${pathname === href ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>{label}<ChevronRight width={14} className={pathname === href ? "opacity-100" : "opacity-0"} /></Link>)}</nav><div className="absolute bottom-5 left-5 right-5 rounded-lg border border-border/70 bg-background/70 p-3"><p className="text-xs font-medium">{section.kind === "provider" ? "Provider workspace" : "Administration"}</p><p className="mt-1 text-xs text-muted-foreground">Live account data</p></div></aside><main className="min-w-0 flex-1"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-8"><div className="flex items-center gap-3"><Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setMobileOpen(true)}><Menu width={18} /></Button><div><p className="font-display text-sm font-semibold">{section.title}</p><p className="hidden text-xs text-muted-foreground sm:block">Soundstage operations console</p></div></div><div className="flex items-center gap-2">{section.kind === "admin" && <EventNotifications />}<div className="hidden h-8 w-px bg-border sm:block" /><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{section.kind === "provider" ? providerInitials : adminInitials}</div><span className="hidden text-sm sm:block">{section.kind === "provider" ? providerName : adminName}</span></div></div></header><div className="p-4 sm:p-8"><div className="mb-7 flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-sm text-primary">{section.kind === "provider" ? "Provider workspace" : "Platform administration"}</p><h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-balance">{section.title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{section.description}</p></div><div className="flex items-center gap-2">{section.kind === "admin" && <ClearAppDataButton />}<Button variant="outline" onClick={() => notify("Help center opened.")}>Help center</Button></div></div>{notice && <div role="status" className="mb-5 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"><Check width={16} />{notice}</div>}{section.kind === "provider" ? <ProviderContent section={section} notify={notify} /> : <AdminContent section={section} notify={notify} />}</div></main></div></div>
}

export default HubWorkspace
