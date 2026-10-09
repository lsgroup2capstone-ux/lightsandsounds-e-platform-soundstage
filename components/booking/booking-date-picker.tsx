"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

export function BookingDatePicker({ value, onChange, min, disabled, isUnavailable }: { value: string; onChange: (date: string) => void; min: string; disabled: boolean; isUnavailable: (date: string) => boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [month, setMonth] = useState(() => (value || min).slice(0, 7))
  const [year, number] = month.split("-").map(Number)
  const first = new Date(year, number - 1, 1)
  const count = new Date(year, number, 0).getDate()
  const title = first.toLocaleDateString("en-PH", { month: "long", year: "numeric" })
  function move(delta: number) {
    const next = new Date(year, number - 1 + delta, 1)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`)
  }
  return <div className="space-y-2">
    <button type="button" disabled={disabled} aria-expanded={expanded} aria-label="Choose event date" onClick={() => setExpanded(!expanded)} className="min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-left text-sm disabled:opacity-50">{disabled ? "Loading dates…" : value || "Choose available date"}</button>
    {expanded && <div className="min-w-0 rounded-lg border border-border bg-card p-2">
      <div className="mb-2 flex items-center justify-between"><button type="button" aria-label="Previous month" disabled={month <= min.slice(0, 7)} onClick={() => move(-1)} className="rounded p-1 disabled:opacity-30"><ChevronLeft size={18} /></button><span className="text-center text-xs font-medium" aria-live="polite">{title}</span><button type="button" aria-label="Next month" onClick={() => move(1)} className="rounded p-1"><ChevronRight size={18} /></button></div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day} className="py-1 text-muted-foreground">{day}</span>)}
        {Array.from({ length: first.getDay() }, (_, i) => <span key={`blank-${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`
          const blocked = date < min || isUnavailable(date)
          return <button key={date} type="button" disabled={disabled || blocked} aria-label={`${date}${blocked ? ", unavailable" : ""}`} aria-pressed={value === date} title={blocked ? "Unavailable for this duration" : date} onClick={() => { onChange(date); setExpanded(false) }} className={`min-h-8 rounded py-1 disabled:cursor-not-allowed disabled:opacity-35 disabled:line-through ${value === date ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{i + 1}</button>
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Crossed-out dates are unavailable for your selected duration.</p>
    </div>}
    {value && isUnavailable(value) && <p role="alert" className="text-xs text-destructive">This date is unavailable. Choose another date or duration.</p>}
  </div>
}
