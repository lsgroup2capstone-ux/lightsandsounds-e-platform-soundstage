import { AccessRefresh } from "@/components/auth/access-refresh"
import { requireRole } from "@/lib/server/access"

export const dynamic = "force-dynamic"

export default async function ProviderLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const decision = await requireRole("provider")
  if (decision.kind === "refresh") return <AccessRefresh to={decision.to} />
  if (decision.kind !== "allow") return <main className="p-8"><p role="alert">We could not verify your access. Please try again.</p><a href="" className="underline">Try again</a></main>
  return children
}
