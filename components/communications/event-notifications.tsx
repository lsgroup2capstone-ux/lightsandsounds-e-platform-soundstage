"use client"

import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { appStorage, mutate } from "@/lib/app-store"
import { getAccount } from "@/lib/client-auth"
import { getClientBookings } from "@/lib/client-bookings"
import type { Booking } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function EventNotifications() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [read, setRead] = useState<string[]>([])
  const key = () => { const account = getAccount(); return `soundstage-event-notifications:${account?.role}:${account?.email.toLowerCase()}` }
  useEffect(() => {
    const refresh = () => {
      const account = getAccount()
      setBookings(account && ["admin", "client"].includes(account.role) ? getClientBookings().filter(b => b.status === "Completed" || (b.status === "Cancelled" && b.cancelledBy === "provider")).sort((a, b) => (b.completedAt || b.cancelledAt || "").localeCompare(a.completedAt || a.cancelledAt || "")) : [])
      try { const saved = JSON.parse(appStorage.getItem(key()) || "[]"); setRead(Array.isArray(saved) ? saved : []) } catch { setRead([]) }
    }
    refresh()
    window.addEventListener("soundstage-bookings-updated", refresh)
    window.addEventListener("storage", refresh)
    return () => { window.removeEventListener("soundstage-bookings-updated", refresh); window.removeEventListener("storage", refresh) }
  }, [])
  const unread = bookings.filter(b => !read.includes(b.id)).length
  return <Dialog><DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Notifications, ${unread} unread`}><Bell width={17} /><span className="sr-only sm:not-sr-only">Notifications</span>{unread > 0 && <span>{unread}</span>}</Button>} /><DialogContent className="max-h-[80dvh] overflow-y-auto"><DialogHeader><DialogTitle>Event notifications</DialogTitle></DialogHeader>{unread > 0 && <Button variant="outline" onClick={async () => { try { const ids = bookings.map(b => b.id); await mutate("setNotificationReads", [ids]); setRead(ids) } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }}>Mark all as read</Button>}{!bookings.length && <p className="text-sm text-muted-foreground">No event notifications yet.</p>}{bookings.map(b => <div key={b.id} className="space-y-2 border-b py-3"><p className="font-medium">{!read.includes(b.id) && <span className="text-primary">New · </span>}{b.status === "Completed" ? "Event completed" : "Event cancelled by provider"}</p><p className="text-sm">{b.provider} marked {b.packageName} as {b.status.toLowerCase()}.</p><p className="text-xs text-muted-foreground">{b.id} · {b.client} · Event date: {b.date}</p>{b.completedAt && <time className="text-xs" dateTime={b.completedAt}>{new Date(b.completedAt).toLocaleString()}</time>}{getAccount()?.role === "client" && <p className="text-sm text-primary">{b.status === "Completed" ? "Share your experience in the Feedback tab." : b.paid ? "Request a refund in the Refunds tab." : "No payment was recorded for this event."}</p>}</div>)}</DialogContent></Dialog>
}
