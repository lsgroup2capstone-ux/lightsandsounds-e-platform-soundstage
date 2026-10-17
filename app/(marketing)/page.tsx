import { Hero } from "@/components/landing/hero"
import {
  Coverage,
  FeaturedPackages,
  HowItWorks,
  ProviderCta,
} from "@/components/landing/sections"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <FeaturedPackages />
        <HowItWorks />
        <Coverage />
        <ProviderCta />
      </main>
      <SiteFooter />
    </div>
  )
}
