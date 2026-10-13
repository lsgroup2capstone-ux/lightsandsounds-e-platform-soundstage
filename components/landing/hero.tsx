import Image from "next/image"
import Link from "next/link"
import { ArrowRight, MapPin, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/hero-stage.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/90 to-background" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-6 sm:pt-32">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-card/80 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
            <span className="flex h-1.5 w-1.5 rounded-full bg-success" />
            Serving Balayan, Nasugbu &amp; Lian, Batangas
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-foreground text-balance sm:text-7xl">
            Book lights &amp; sounds for your event, <span className="text-muted-foreground">all in one place</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty sm:text-xl">
            Skip the group chats and guesswork. Browse realistic demo providers, explore availability screens, and preview the full booking flow — from fiestas to weddings.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/browse">
                Browse services
                <ArrowRight width={18} height={18} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="link" className="w-full sm:w-auto">
              <Link href="/signup?role=provider">Become a provider</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck width={16} height={16} className="text-success" />
              Verified providers
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin width={16} height={16} className="text-primary" />
              Local coverage
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="font-semibold text-foreground">Demo-ready</span> booking &amp; checkout flow
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
