"use client"

import { useState, type ReactElement } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays, Check, ChevronDown, CreditCard, MapPin, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { type Booking, type ServicePackage, formatPeso } from "@/lib/mock-data"
import { getAllBookings, saveClientBooking } from "@/lib/client-bookings"
import { cn } from "@/lib/utils"
import { getAccount } from "@/lib/client-auth"
import { PaymentReceiptCard } from "@/components/payment/payment-receipt"

import { isAreaCovered, getTownDistance, getTransportationTier, getTransportationFee } from "@/lib/booking-pricing"

type Step = 1 | 2 | 3 | 4

const steps = [
  { n: 1 as Step, label: "Event details" },
  { n: 2 as Step, label: "Review" },
  { n: 3 as Step, label: "Downpayment" },
  { n: 4 as Step, label: "Confirmed" },
]

export function BookingFlow({ pkg, trigger }: { pkg: ServicePackage; trigger: ReactElement }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [eventType, setEventType] = useState("")
  const [venue, setVenue] = useState("")
  const [eventTown, setEventTown] = useState("")
  const [guests, setGuests] = useState("")
  const [notes, setNotes] = useState("")
  const [durationDays, setDurationDays] = useState(1)
  const [bookingError, setBookingError] = useState("")
  const [saving, setSaving] = useState(false)
  const [completedBooking, setCompletedBooking] = useState<Booking | null>(null)
  const [reference, setReference] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("GCash")

  const servicePrice = Math.round(pkg.price * (1 + 0.38 * (durationDays - 1)))
  const extensionCharge = servicePrice - pkg.price
  const outsideCoverage = eventTown.trim() !== "" && !isAreaCovered(eventTown, pkg.coverageAreas || pkg.location)
  const townsAway = outsideCoverage ? getTownDistance(pkg.coverageAreas || pkg.location, eventTown) : 0
  const transportationFee = outsideCoverage ? getTransportationFee(eventTown, townsAway) : 0
  const transportationTier = getTransportationTier(eventTown, townsAway)
  const totalPrice = servicePrice + transportationFee
  const downpayment = Math.round(totalPrice * 0.3)
  const balance = totalPrice - downpayment
  const canProceed = date && time.trim() && eventType.trim() && eventTown && venue && guests

  function reset() {
    setStep(1)
    setDate("")
    setTime("")
    setEventType("")
    setVenue("")
    setEventTown("")
    setGuests("")
    setNotes("")
    setDurationDays(1)
    setBookingError("")
    setCompletedBooking(null)
    setReference("")
    setPaymentMethod("GCash")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setTimeout(reset, 200)
  }

  async function completePayment() {
    if (saving) return
    const conflict = findBookingConflict()
    if (conflict) { setBookingError(`The selected date is already booked through ${formatEndDate(conflict.date, conflict.durationDays || 1)}.`); setStep(1); return }
    const bookingReference = `BK-${Date.now().toString().slice(-6)}`
    const client = getAccount()
    const booking: Booking = {
      id: bookingReference,
      packageId: pkg.id,
      packageName: pkg.name,
      provider: pkg.provider.name,
      client: client ? `${client.firstName} ${client.lastName}` : "Client",
      image: pkg.image,
      date,
      time: time.trim(),
      eventType: eventType.trim(),
      location: venue,
      guests: Number(guests),
      notes,
      durationDays,
      basePrice: pkg.price,
      transportationFee,
      eventTown,
      townsAway: outsideCoverage ? townsAway : 0,
      coverageAreas: pkg.coverageAreas || pkg.location,
      total: totalPrice,
      downpayment,
      status: "Pending",
      paid: true,
      paidAt: new Date().toISOString(),
      paymentMethod,
    }
    setSaving(true)
    try {
      const saved = await saveClientBooking(booking)
      setCompletedBooking(saved)
      setReference(saved.id)
      setStep(4)
    } catch (error) { setBookingError((error as Error).message); setStep(1) }
    finally { setSaving(false) }
  }

  function findBookingConflict(startDate = date, days = durationDays) {
    if (!startDate) return undefined
    const requestedDates = eventDates(startDate, days)
    return getAllBookings().find((booking) => booking.provider === pkg.provider.name && booking.status !== "Cancelled" && eventDates(booking.date, booking.durationDays || 1).some((bookedDate) => requestedDates.includes(bookedDate)))
  }

  function selectDate(nextDate: string) {
    setDate(nextDate)
    const conflict = findBookingConflict(nextDate)
    setBookingError(conflict ? "This date is already booked for this provider. Choose another date." : "")
  }

  function selectDuration(days: number) {
    setDurationDays(days)
    const conflict = findBookingConflict(date, days)
    setBookingError(conflict ? "One or more dates in this booking are unavailable. Choose another date or duration." : "")
  }

  function continueToReview() {
    const conflict = findBookingConflict()
    if (conflict) return setBookingError(`This provider is already booked on the selected date. Choose another date.`)
    setBookingError("")
    setStep(2)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {step === 4 ? "Booking confirmed" : `Book ${pkg.name}`}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        {step < 4 && (
          <ol className="mb-2 flex items-center gap-1.5">
            {steps.slice(0, 3).map((s) => (
              <li key={s.n} className="flex flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step >= s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {step > s.n ? <Check width={13} height={13} /> : s.n}
                </span>
                <span
                  className={cn(
                    "hidden text-xs sm:block",
                    step >= s.n ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                {s.n < 3 && <span className="h-px flex-1 bg-border" />}
              </li>
            ))}
          </ol>
        )}

        {/* Step 1: Event details */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-date">Event date</Label>
                <Input id="bk-date" type="date" min={today()} value={date} onChange={(e) => selectDate(e.target.value)} aria-describedby="bk-date-help" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-time">Start time</Label>
                <Input id="bk-time" type="text" placeholder="e.g. 6:00 PM" maxLength={64} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-event-type">Type of event</Label>
              <Input id="bk-event-type" value={eventType} onChange={event => setEventType(event.target.value)} placeholder="e.g. Wedding, birthday, corporate event" maxLength={100} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-duration">Event duration</Label>
              <div className="relative">
              <select id="bk-duration" value={durationDays} onChange={(event) => selectDuration(Number(event.target.value))} className="h-10 w-full appearance-none rounded-md border border-input bg-card py-2 pl-3 pr-10 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50">
                <option value={1}>1 day</option><option value={2}>2 days (+38%)</option><option value={3}>3 days (+76%)</option>
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Each additional day costs 38% of the base service price.</p>
              <p id="bk-date-help" className="text-xs text-muted-foreground">Dates already booked with this provider are unavailable to other clients.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-town">Event town / city</Label>
              <Input id="bk-town" value={eventTown} onChange={(e) => setEventTown(e.target.value)} placeholder="e.g. Balayan" />
              <p className="text-xs text-muted-foreground">Covered town/city: {pkg.coverageAreas || pkg.location}. Barangays within this town/city are covered.</p>
              {outsideCoverage && <div className="rounded-md border border-warning/30 bg-warning/10 p-3"><p className="text-xs text-warning">This location is outside the provider&apos;s covered area. Nearby destinations such as Tagaytay, Cavite start at ₱1,000; farther cities and provinces cost more.</p><p className="mt-1 text-xs font-medium text-warning">Transportation fee ({transportationTier}): {formatPeso(transportationFee)}</p></div>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-venue">Venue / address</Label>
              <Input
                id="bk-venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Balayan Town Plaza"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-guests">Expected guests</Label>
              <Input
                id="bk-guests"
                type="number"
                min={1}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                placeholder="e.g. 300"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-notes">Notes for the provider (optional)</Label>
              <Textarea
                id="bk-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Theme, special requests, load-in details..."
                rows={3}
              />
            </div>
            {bookingError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{bookingError}</p>}
            <Button className="mt-1" disabled={!canProceed} onClick={continueToReview}>
              Continue to review
            </Button>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-card/50 p-4">
              <p className="font-semibold text-foreground">{pkg.name}</p>
              <p className="text-sm text-muted-foreground">{pkg.provider.name}</p>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Row icon={<CalendarDays width={15} height={15} />} label={`${date} at ${time}`} />
                <Row icon={<Users width={15} height={15} />} label={`Event type: ${eventType}`} />
                <Row icon={<CalendarDays width={15} height={15} />} label={`${durationDays} day${durationDays === 1 ? "" : "s"} · ends ${formatEndDate(date, durationDays)}`} />
                <Row icon={<MapPin width={15} height={15} />} label={eventTown} />
                <Row icon={<MapPin width={15} height={15} />} label={venue} />
                <Row icon={<Users width={15} height={15} />} label={`${guests} guests`} />
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base service price</span>
                <span className="font-medium text-foreground">{formatPeso(pkg.price)}</span>
              </div>
              {durationDays > 1 && <div className="flex justify-between"><span className="text-muted-foreground">Extended days ({durationDays - 1} × 38%)</span><span className="font-medium text-foreground">{formatPeso(extensionCharge)}</span></div>}
              {transportationFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Transportation fee ({transportationTier})</span><span className="font-medium text-foreground">{formatPeso(transportationFee)}</span></div>}
              <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Event total</span><span className="font-semibold text-foreground">{formatPeso(totalPrice)}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Downpayment (30%)</span>
                <span className="font-medium text-primary">{formatPeso(downpayment)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Balance on event day</span>
                <span className="font-medium text-foreground">{formatPeso(balance)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-border" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue to demo checkout
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Downpayment */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
              <p className="text-sm text-muted-foreground">Downpayment due now</p>
              <p className="font-display text-3xl font-bold text-foreground">{formatPeso(downpayment)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Secure your date. Balance of {formatPeso(balance)} is paid on the event day.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Payment method</Label>
              <div className="flex flex-col gap-2">
                <PayOption label="GCash" desc="Demo e-wallet option" checked={paymentMethod === "GCash"} onChange={setPaymentMethod} />
                <PayOption label="Credit / Debit card" desc="Demo card option" checked={paymentMethod === "Credit / Debit card"} onChange={setPaymentMethod} />
                <PayOption label="Maya" desc="Demo e-wallet option" checked={paymentMethod === "Maya"} onChange={setPaymentMethod} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-border" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button className="flex-1" disabled={saving} onClick={completePayment}>
                <CreditCard width={16} height={16} />
                Pay {formatPeso(downpayment)}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmed */}
        {step === 4 && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
              <Check width={32} height={32} />
            </span>
            <div>
              <p className="font-display text-xl font-semibold text-foreground">You&apos;re all set!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your booking request for {pkg.name} has been sent to {pkg.provider.name}. You&apos;ll get an update once
                they confirm.
              </p>
            </div>
            <div className="w-full rounded-lg border border-border bg-card/50 p-3 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-mono text-foreground">{reference}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Paid today</span>
                <span className="font-medium text-success">{formatPeso(downpayment)}</span>
              </div>
            </div>
            {completedBooking && <div className="w-full text-left"><PaymentReceiptCard booking={completedBooking} /></div>}
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1 border-border" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  handleOpenChange(false)
                  router.push("/dashboard?tab=bookings")
                }}
              >
                View my bookings
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-2 text-muted-foreground">
      <span className="text-primary">{icon}</span>
      <span className="text-foreground">{label}</span>
    </span>
  )
}

function PayOption({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (method: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10">
      <input type="radio" name="pay" checked={checked} onChange={() => onChange(label)} className="h-4 w-4 accent-[var(--primary)]" />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{desc}</span>
      </span>
    </label>
  )
}

function eventDates(startDate: string, durationDays: number) {
  const start = new Date(`${startDate}T00:00:00`)
  return Array.from({ length: durationDays }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  })
}

function formatEndDate(startDate: string, durationDays: number) {
  const endDate = eventDates(startDate, durationDays).at(-1) || startDate
  return new Date(`${endDate}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "medium" })
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
