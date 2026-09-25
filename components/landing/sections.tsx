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
import { PackageCard } from "@/components/site/package-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { packages } from "@/lib/mock-data"

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
    <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
          From booking to beat drop in four steps
        </h2>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <Card key={step.title} className="border-border/70 bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <step.icon width={22} height={22} />
              </span>
              <span className="font-display text-sm font-semibold text-muted-foreground/50">0{i + 1}</span>
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{step.title}</h3>
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
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Featured packages</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
            Popular setups this season
          </h2>
        </div>
        <Button asChild variant="ghost" className="hidden shrink-0 text-primary hover:text-primary/80 sm:inline-flex">
          <Link href="/browse">View all</Link>
        </Button>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
      <div className="mt-6 sm:hidden">
        <Button asChild variant="outline" className="w-full border-border/70">
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
    <section id="coverage" className="scroll-mt-20 border-y border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Coverage</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
            Built for western Batangas
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
            Every provider on SoundStage maps their exact service area, so you always know who can reach your venue —
            no more back-and-forth to confirm coverage.
          </p>
          <div className="mt-6 space-y-3">
            {areas.map((a) => (
              <div key={a.name} className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/60 p-4">
                <MapPinned width={20} height={20} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{a.name}</p>
                  <p className="text-sm text-muted-foreground">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <Card className="relative overflow-hidden border-border/70 bg-background/60 p-2">
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_30%_20%,rgba(0,229,255,0.15),transparent_45%),radial-gradient(circle_at_75%_70%,rgba(176,38,255,0.15),transparent_45%)]">
            <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#f5f5f5_1px,transparent_1px),linear-gradient(to_bottom,#f5f5f5_1px,transparent_1px)] [background-size:32px_32px]" />
            {[
              { top: "34%", left: "28%", label: "Balayan" },
              { top: "58%", left: "52%", label: "Nasugbu" },
              { top: "46%", left: "72%", label: "Lian" },
            ].map((pin) => (
              <div key={pin.label} className="absolute flex flex-col items-center" style={{ top: pin.top, left: pin.left }}>
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
                </span>
                <span className="mt-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur">
                  {pin.label}
                </span>
              </div>
            ))}
          </div>
        </Card>
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
    <section id="providers" className="scroll-mt-20 border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-background p-8 sm:p-12">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_120%_at_100%_0%,rgba(176,38,255,0.16),transparent_60%)]" />
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-accent">For providers</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
                Run your lights &amp; sounds business the modern way
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
                List your packages, control your calendar, and get paid on time. Join the growing network of local
                providers on SoundStage.
              </p>
              <Button asChild size="lg" className="glow-accent mt-6 bg-accent text-accent-foreground hover:bg-accent/90">
                <Link href="/signup?role=provider">Apply as a provider</Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {perks.map((p) => (
                <div key={p.title} className="flex items-start gap-3 rounded-lg border border-border/70 bg-card/60 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
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
