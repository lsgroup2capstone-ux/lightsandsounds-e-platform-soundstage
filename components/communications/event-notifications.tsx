"use client"

import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { appStorage, mutate } from "@/lib/data/app-store"
import { getAccount } from "@/lib/auth/client-auth"
import { getClientBookings } from "@/lib/booking/client-bookings"
import { getBookingMessages, type BookingMessage } from "@/lib/communications/communications"
import type { Booking } from "@/lib/marketplace/mock-data"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function EventNotifications() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [messages, setMessages] = useState<BookingMessage[]>([])
  const [isProvider, setIsProvider] = useState(false)
  const [read, setRead] = useState<string[]>([])
  const key = () => { const account = getAccount(); return `soundstage-event-notifications:${account?.role}:${account?.email.toLowerCase()}` }
  useEffect(() => {
    const refresh = () => {
      const account = getAccount()
      const provider = account?.role === "provider"
      const providerName = provider ? account.business || `${account.firstName} ${account.lastName}` : ""
      setIsProvider(provider)
      setBookings(!account ? [] : provider ? getClientBookings().filter(b => b.provider === providerName).reverse() : ["admin", "client"].includes(account.role) ? getClientBookings().filter(b => String(b.status).toLowerCase() === "completed" || (["cancelled", "declined"].includes(String(b.status).toLowerCase()) && b.cancelledBy === "provider")).sort((a, b) => (b.completedAt || b.cancelledAt || "").localeCompare(a.completedAt || a.cancelledAt || "")) : [])
      setMessages(provider ? getBookingMessages().filter(m => m.provider === providerName && m.senderRole === "client").sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [])
      try { const saved = JSON.parse(appStorage.getItem(key()) || "[]"); setRead(Array.isArray(saved) ? saved : []) } catch { setRead([]) }
    }
    refresh()
    window.addEventListener("soundstage-bookings-updated", refresh)
    window.addEventListener("soundstage-messages-updated", refresh)
    window.addEventListener("storage", refresh)
    return () => { window.removeEventListener("soundstage-bookings-updated", refresh); window.removeEventListener("soundstage-messages-updated", refresh); window.removeEventListener("storage", refresh) }
  }, [])
  const ids = [...bookings.map(b => b.id), ...messages.map(m => m.id)]
  const unread = ids.filter(id => !read.includes(id)).length
  return <Dialog><DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Notifications, ${unread} unread`}><Bell width={17} /><span className="sr-only sm:not-sr-only">Notifications</span>{unread > 0 && <span>{unread}</span>}</Button>} /><DialogContent className="max-h-[80dvh] overflow-y-auto"><DialogHeader><DialogTitle>Event notifications</DialogTitle></DialogHeader>{unread > 0 && <Button variant="outline" onClick={async () => { try { await mutate("setNotificationReads", [ids]); setRead(ids) } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }}>Mark all as read</Button>}{!ids.length && <p className="text-sm text-muted-foreground">No event notifications yet.</p>}{isProvider && messages.map(m => <div key={m.id} className="space-y-2 border-b py-3"><p className="font-medium">{!read.includes(m.id) && <span className="text-primary">New · </span>}New message from {m.senderName}</p><p className="line-clamp-2 text-sm">{m.body}</p><p className="text-xs text-muted-foreground">{m.bookingId} · <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString()}</time></p></div>)}{isProvider && bookings.map(b => <div key={b.id} className="space-y-2 border-b py-3"><p className="font-medium">{!read.includes(b.id) && <span className="text-primary">New · </span>}New booking from {b.client}</p><p className="text-sm">{b.client} booked {b.packageName}.</p><p className="text-xs text-muted-foreground">{b.id} · Event date: {b.date} · {b.status}</p></div>)}{!isProvider && bookings.map(b => <div key={b.id} className="space-y-2 border-b py-3"><p className="font-medium">{!read.includes(b.id) && <span className="text-primary">New · </span>}{String(b.status).toLowerCase() === "completed" ? "Event completed" : "Event cancelled by provider"}</p><p className="text-sm">{b.provider} marked {b.packageName} as {b.status.toLowerCase()}.</p><p className="text-xs text-muted-foreground">{b.id} · {b.client} · Event date: {b.date}</p>{b.completedAt && <time className="text-xs" dateTime={b.completedAt}>{new Date(b.completedAt).toLocaleString()}</time>}{getAccount()?.role === "client" && <p className="text-sm text-primary">{String(b.status).toLowerCase() === "completed" ? "Share your experience in the Feedback tab." : b.paid ? "Request a refund in the Refunds tab." : "No payment was recorded for this event."}</p>}</div>)}</DialogContent></Dialog>
}
