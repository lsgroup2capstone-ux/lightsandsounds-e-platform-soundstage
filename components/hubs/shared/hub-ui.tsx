"use client"

import { useEffect, useState } from "react"
import { Check, MoreHorizontal, TrendingUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { hubStatus, monthlyRevenue } from "@/lib/data/hub-data"

export function Status({ children }: { children: string }) {
  return <Badge variant="outline" className={hubStatus(children)}>{children}</Badge>
}

export function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof TrendingUp }) {
  return <Card className="border-border/70 bg-card/75"><CardContent className="flex items-start justify-between p-5"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-primary"><Icon width={18} height={18} /></div></CardContent></Card>
}

export function Chart() {
  return <div className="flex h-48 items-end gap-2 border-b border-l border-border/70 px-4 pb-3 pt-4">{monthlyRevenue.map((value, index) => <div key={index} className="group flex flex-1 flex-col items-center justify-end gap-2"><div className="w-full rounded-t-sm bg-primary/80 transition-all group-hover:bg-primary" style={{ height: `${value * 1.25}px` }} /><span className="text-[10px] text-muted-foreground">{["S","O","N","D","J","F","M","A","M","J","J","A"][index]}</span></div>)}</div>
}

export function RowMenu({ items }: { items: { label: string; onSelect: () => void; destructive?: boolean }[] }) {
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => { if (!open) return; const close = () => setOpen(null); window.addEventListener("scroll", close, true); window.addEventListener("resize", close); return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close) } }, [open])
  return <div className="inline-block text-left"><Button aria-label="More options" aria-haspopup="menu" aria-expanded={!!open} size="icon" variant="ghost" className="h-8 w-8" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setOpen((value) => value ? null : { top: rect.bottom + 4, right: window.innerWidth - rect.right }) }} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) setOpen(null) }}><MoreHorizontal width={16} height={16} /></Button>{open && <div role="menu" style={{ top: open.top, right: open.right }} className="fixed z-50 min-w-32 overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-lg">{items.map((item) => <button key={item.label} role="menuitem" type="button" className={`block w-full px-3 py-2 text-left hover:bg-muted ${item.destructive ? "text-destructive" : ""}`} onClick={() => { setOpen(null); item.onSelect() }}>{item.label}</button>)}</div>}</div>
}

export function Table({ headers, rows, onAction, menu }: { headers: string[]; rows: (string | React.ReactNode)[][]; onAction?: (index: number, action: "approve" | "reject" | "release") => void; menu?: (index: number) => React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-border/70"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}<th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-border/60">{rows.map((row, index) => <tr key={index} id={typeof row[0] === "string" ? `transaction-${row[0]}` : undefined} className="scroll-mt-24 transition-colors hover:bg-muted/20">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3.5 text-foreground/85">{cell}</td>)}{onAction ? <td className="px-4 py-3.5 text-right"><div className="flex justify-end gap-1"><Button aria-label="Approve" size="icon" variant="ghost" className="h-8 w-8 text-success" onClick={() => onAction(index, "approve")}><Check width={15} height={15} /></Button><Button aria-label="Reject" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onAction(index, "reject")}><X width={15} height={15} /></Button></div></td> : <td className="px-4 py-3.5 text-right">{menu ? menu(index) : <Button aria-label="More options" size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal width={16} height={16} /></Button>}</td>}</tr>)}</tbody></table></div>
}
