import type { Metadata } from "next"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { ServicesBrowser } from "@/components/browse/services-browser"

export const metadata: Metadata = {
  title: "Browse Services | Soundstage",
  description: "Browse verified lights and sounds service packages across Balayan, Nasugbu, and Lian.",
}

export default function BrowsePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="border-b border-border/60 bg-card/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Service marketplace</p>
            <h1 className="mt-3 text-balance font-sans text-3xl font-bold tracking-tight md:text-4xl">
              Find the right rig for your event
            </h1>
            <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              Compare verified lights and sounds providers across western Batangas. Filter by category, location, and
              budget to find your perfect match.
            </p>
          </div>
        </div>
        <ServicesBrowser />
      </main>
      <SiteFooter />
    </div>
  )
}
