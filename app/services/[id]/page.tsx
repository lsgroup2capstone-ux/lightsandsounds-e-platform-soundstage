import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BadgeCheck, Calendar, Check, MapPin, Sparkles, Users } from "lucide-react"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { BookingFlow } from "@/components/booking/booking-flow"
import { ServiceReviews } from "@/components/site/service-reviews"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getPackage, packages, formatPeso } from "@/lib/mock-data"

export function generateStaticParams() {
  return packages.map((p) => ({ id: p.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pkg = getPackage(id)
  return {
    title: pkg ? `${pkg.name} | Soundstage` : "Service | Soundstage",
    description: pkg?.tagline,
  }
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pkg = getPackage(id)
  if (!pkg) notFound()

  const related = packages.filter((p) => p.id !== pkg.id && p.category === pkg.category).slice(0, 3)

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
          <Link
            href="/browse"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft width={15} height={15} />
            Back to browse
          </Link>
        </div>

        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-16 md:px-6 lg:grid-cols-[1fr_360px]">
          {/* Main */}
          <div>
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl shadow-soft">
              <Image
                src={pkg.image || "/placeholder.svg"}
                alt={pkg.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 66vw"
                className="object-cover"
              />
              <div className="absolute left-4 top-4 flex gap-2">
                <Badge variant="secondary" className="bg-card/85 text-foreground shadow-soft backdrop-blur">
                  {pkg.category}
                </Badge>
                {pkg.premium && (
                  <Badge className="gap-1 bg-foreground text-background">
                    <Sparkles width={12} height={12} />
                    Premium
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h1 className="text-balance font-sans text-3xl font-bold tracking-tight md:text-4xl">{pkg.name}</h1>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{pkg.tagline}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <MapPin width={15} height={15} className="text-primary" />
                  {pkg.location}
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Users width={15} height={15} className="text-primary" />
                  {pkg.capacity}
                </span>
              </div>
            </div>

            <Separator className="my-8 bg-border/60" />

            <section>
              <h2 className="font-sans text-xl font-semibold">What&apos;s included</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {pkg.inclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check width={13} height={13} />
                    </span>
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <ServiceReviews serviceId={pkg.id} />

            <Separator className="my-8 bg-border/60" />

            {/* Provider */}
            <section>
              <h2 className="font-sans text-xl font-semibold">About the provider</h2>
              <div className="mt-4 rounded-lg bg-card p-5 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {pkg.provider.name.charAt(0)}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-foreground">{pkg.provider.name}</p>
                      {pkg.provider.verified && <BadgeCheck width={16} height={16} className="text-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Serving events since {pkg.provider.since}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{pkg.provider.bio}</p>
              </div>
            </section>

          </div>

          {/* Booking sidebar */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl bg-card p-6 shadow-soft">
              <p className="text-sm text-muted-foreground">Package price</p>
              <p className="font-sans text-3xl font-bold text-foreground">{formatPeso(pkg.price)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                30% downpayment ({formatPeso(Math.round(pkg.price * 0.3))}) secures your date.
              </p>

              <BookingFlow
                pkg={pkg}
                trigger={
                  <Button className="mt-5 w-full" size="lg">
                    <Calendar width={16} height={16} />
                    Book this package
                  </Button>
                }
              />

              <ul className="mt-5 flex flex-col gap-2.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <BadgeCheck width={15} height={15} className="text-success" />
                  Verified provider
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck width={15} height={15} className="text-success" />
                  Secure PayMongo payments
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck width={15} height={15} className="text-success" />
                  Free cancellation up to 7 days before
                </li>
              </ul>
            </div>
          </aside>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="bg-card">
            <div className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6">
              <h2 className="font-sans text-xl font-semibold">Similar packages</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/services/${r.id}`}
                    className="group flex gap-3 rounded-lg bg-background p-3 transition-shadow hover:shadow-soft"
                  >
                    <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-md">
                      <Image src={r.image || "/placeholder.svg"} alt={r.name} fill sizes="96px" className="object-cover" />
                    </div>
                    <div className="flex flex-col justify-center">
                      <p className="text-sm font-medium leading-tight text-foreground">{r.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{r.location}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatPeso(r.price)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
