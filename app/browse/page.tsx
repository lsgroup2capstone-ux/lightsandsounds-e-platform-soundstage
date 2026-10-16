import type { Metadata } from "next"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { ServicesBrowser } from "@/components/browse/services-browser"

export const metadata: Metadata = {
  title: "Browse Services | Soundstage",
  description: "Browse verified lights and sounds service providers across Balayan, Nasugbu, and Lian.",
}

export default function BrowsePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="bg-card">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-16">
            <p className="text-base font-semibold text-primary">Service marketplace</p>
            <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              Find the right rig for your event
            </h1>
            <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              Compare verified lights and sounds providers across western Batangas. Filter by category and
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
