import type { Metadata } from "next"
import { SiteHeader } from "@/components/site/site-header"
import { SiteFooter } from "@/components/site/site-footer"
import { ProviderProfile } from "@/components/marketplace/provider-profile"

export const metadata: Metadata = {
  title: "Provider | Soundstage",
}

export default async function ProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <ProviderProfile id={encodeURIComponent(decodeURIComponent(id))} />
      </main>
      <SiteFooter />
    </div>
  )
}
