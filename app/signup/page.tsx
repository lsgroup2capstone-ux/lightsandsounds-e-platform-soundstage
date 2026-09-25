import { AuthShell } from "@/components/auth/auth-shell"
import { SignupForm } from "@/components/auth/signup-form"

export const metadata = {
  title: "Sign up — SoundStage",
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ role?: string; returnTo?: string }> }) {
  const { role, returnTo } = await searchParams
  const initialRole = role === "provider" ? "provider" : "client"

  return (
    <AuthShell title="Create your SoundStage account" subtitle="Register as a client or service provider to get started.">
      <SignupForm initialRole={initialRole} returnTo={returnTo} />
    </AuthShell>
  )
}
