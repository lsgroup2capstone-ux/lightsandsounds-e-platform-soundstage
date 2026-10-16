"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { getSystemActivity, type SystemActivity } from "@/lib/system-activity"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function SystemActivityPanel({ detail = false }: { detail?: boolean }) {
  const [items, setItems] = useState<SystemActivity[]>([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [openId, setOpenId] = useState("")
  useEffect(() => {
    const sync = () => setOpenId(decodeURIComponent(window.location.hash.replace(/^#activity-/, "")))
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])
  function closeRecord() {
    setOpenId("")
    history.replaceState(null, "", window.location.pathname + window.location.search)
  }
  useEffect(() => {
    const refresh = () => setItems(getSystemActivity())
    refresh()
    const events = ["storage", "soundstage-account-updated", "soundstage-bookings-updated", "soundstage-marketplace-updated", "soundstage-services-updated", "soundstage-messages-updated", "soundstage-reports-updated", "soundstage-withdrawals-updated"]
    events.forEach(event => window.addEventListener(event, refresh))
    return () => events.forEach(event => window.removeEventListener(event, refresh))
  }, [])
  const filtered = items.filter(item => (category === "All" || item.category === category) && `${item.title} ${item.actor} ${item.target} ${item.summary}`.toLowerCase().includes(search.toLowerCase()))
  return <Card><CardHeader><CardTitle>{detail ? "System activity details" : "All system activity"}</CardTitle><p className="text-sm text-muted-foreground">Recorded actions and current records, newest first. Click any activity to open its related record. Older records without a saved timestamp appear last.</p><div className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Search system activity" placeholder="Search activity, person or reference" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter activity category" className="rounded-md border bg-background p-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}>{["All", ...Array.from(new Set(items.map(item => item.category))).sort()].map(value => <option key={value}>{value}</option>)}</select></div></CardHeader><CardContent className="space-y-3">{!filtered.length && <p className="py-8 text-center text-muted-foreground">No activity found.</p>}{filtered.map(item => <div key={item.id} id={detail ? `activity-${item.id}` : undefined} className="scroll-mt-24 overflow-hidden rounded-lg border"><Link href={item.href} onClick={() => detail && setOpenId(item.id)} className="block p-4 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"><p className="text-xs text-primary">{item.category}</p><p className="mt-1 font-medium">{item.title}</p><p className="mt-1 break-words text-sm">{item.summary}</p><p className="mt-2 break-all text-xs text-muted-foreground">{item.actor} / {item.target}</p><p className="mt-1 text-xs text-muted-foreground">{item.at ? new Date(item.at).toLocaleString() : "Date not recorded"}</p><span className="mt-2 block text-xs text-primary">Open record &rarr;</span></Link>{detail && openId === item.id && <><dl className="grid gap-3 border-t p-4 text-sm sm:grid-cols-2">{item.details.map(([label, value], index) => <div key={index}><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl><div className="border-t px-4 py-3"><button type="button" onClick={closeRecord} className="text-xs text-primary hover:underline">Close record &times;</button></div></>}</div>)}</CardContent></Card>
}
