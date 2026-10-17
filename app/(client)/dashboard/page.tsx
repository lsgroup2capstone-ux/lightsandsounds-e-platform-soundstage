import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentProfile, revokeInactiveSession, routeDashboard } from "@/lib/server/auth/access"

export const metadata: Metadata = {
  title: "Dashboard | SoundStage",
  description: "Open your SoundStage dashboard.",
}

export const dynamic = "force-dynamic"

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; tab?: string }> }) {
  const { returnTo, tab } = await searchParams
  const current = await getCurrentProfile()
  if (!current) redirect(routeDashboard(null, { signedIn: false, returnTo, tab }))
  if (current.error) return <main className="p-8"><p role="alert">We could not verify your access. Please try again.</p><a href="" className="underline">Try again</a></main>
  if (current.profile?.status !== "active" && current.profile) {
    if (!await revokeInactiveSession(current.session.sessionId, current.profile.status)) return <main className="p-8"><p role="alert">We could not sign you out. Please try again.</p><a href="" className="underline">Try again</a></main>
  }
  redirect(routeDashboard(current.profile, { signedIn: true, returnTo, tab }))
}
