import { AuthShell } from "@/components/auth/auth-shell"
import { LoginForm } from "@/components/auth/login-form"

export const metadata = {
  title: "Log in — SoundStage",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; reset?: string }> }) {
  const { returnTo, reset } = await searchParams
  return (
    <AuthShell title="Access your SoundStage account" subtitle="Sign in securely to manage your bookings or service operations.">
      {reset === "success" && <p role="status" className="mb-4 text-sm text-success">Your password has been reset. Sign in with your new password.</p>}
      <LoginForm key={reset === "success" ? "after-reset" : "login"} returnTo={returnTo} resetSuccess={reset === "success"} />
    </AuthShell>
  )
}
