import type { Metadata } from "next"
import { ClientDashboard } from "@/components/client/client-dashboard"

export const metadata: Metadata = {
  title: "Client Hub | Soundstage",
  description: "Manage your Soundstage event bookings and payments.",
}

export default async function ClientPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const initialTab = tab === "profile" ? "My profile" : tab === "bookings" ? "My bookings" : tab === "payments" ? "Payments" : "Overview"
  return <ClientDashboard initialTab={initialTab} />
}
