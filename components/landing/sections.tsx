import Link from "next/link"
import {
  CalendarCheck,
  CreditCard,
  MapPinned,
  Search,
  Store,
  TrendingUp,
  Users,
} from "lucide-react"
import { PackageCard } from "@/components/marketplace/package-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { packages } from "@/lib/marketplace/mock-data"

const steps = [
  {
    icon: Search,
    title: "Browse & compare",
    body: "Filter packages by type, price, and location to find the right fit for your event.",
  },
  {
    icon: CalendarCheck,
    title: "Check availability",
    body: "Pick a date on the provider's live calendar and send a booking request instantly.",
  },
  {
    icon: CreditCard,
    title: "Preview checkout",
    body: "Walk through realistic booking and payment screens using local demo data.",
  },
  {
    icon: CalendarCheck,
    title: "Enjoy your event",
    body: "Your provider handles delivery, setup, and operation on the event day.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="max-w-2xl">
        <p className="text-base font-semibold text-primary">How it works</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight text-foreground text-balance sm:text-5xl">
          From booking to beat drop in four steps
        </h2>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <Card key={step.title} className="p-6">
            <div className="flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <step.icon width={22} height={22} />
              </span>
              <span className="text-sm font-semibold text-muted-foreground/60">0{i + 1}</span>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </Card>
        ))}
      </div>
    </section>
  )
}

export function FeaturedPackages() {
  const featured = packages.slice(0, 3)
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-base font-semibold text-primary">Featured packages</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-tight text-foreground text-balance sm:text-5xl">
            Popular setups this season
          </h2>
        </div>
        <Button asChild variant="link" className="hidden shrink-0 sm:inline-flex">
          <Link href="/browse">View all</Link>
        </Button>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
      <div className="mt-6 sm:hidden">
        <Button asChild variant="outline" className="w-full">
          <Link href="/browse">View all packages</Link>
        </Button>
      </div>
    </section>
  )
}

export function Coverage() {
  const areas = [
    { name: "Balayan", detail: "Town plaza, resorts & barangay events" },
    { name: "Nasugbu", detail: "Beachfront & open-air venues" },
    { name: "Lian", detail: "Resorts, halls & private estates" },
  ]
  return (
    <section id="coverage" className="scroll-mt-20 bg-card">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div>
          <p className="text-base font-semibold text-primary">Coverage</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-tight text-foreground text-balance sm:text-5xl">
            Built for western Batangas
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
            Every provider on SoundStage maps their exact service area, so you always know who can reach your venue —
            no more back-and-forth to confirm coverage.
          </p>
          <div className="mt-6 space-y-3">
            {areas.map((a) => (
              <div key={a.name} className="flex items-start gap-3 rounded-lg bg-muted/60 p-4">
                <MapPinned width={20} height={20} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{a.name}</p>
                  <p className="text-sm text-muted-foreground">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export function ProviderCta() {
  const perks = [
    { icon: Users, title: "Reach more clients", body: "Get discovered by event hosts across your service area." },
    { icon: TrendingUp, title: "Grow your income", body: "Manage bookings, payments, and withdrawals in one dashboard." },
    { icon: Store, title: "Simple subscriptions", body: "Flexible monthly or yearly plans — no hidden fees." },
  ]
  return (
    <section id="providers" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-xl bg-card p-8 shadow-soft sm:p-14">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-base font-semibold text-primary">For providers</p>
              <h2 className="mt-2 text-4xl font-semibold tracking-tight text-foreground text-balance sm:text-5xl">
                Run your lights &amp; sounds business the modern way
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
                List your packages, control your calendar, and get paid on time. Join the growing network of local
                providers on SoundStage.
              </p>
              <Button asChild size="lg" className="mt-8">
                <Link href="/signup?role=provider">Apply as a provider</Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {perks.map((p) => (
                <div key={p.title} className="flex items-start gap-3 rounded-lg bg-muted/60 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <p.icon width={20} height={20} />
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{p.title}</p>
                    <p className="text-sm text-muted-foreground">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
