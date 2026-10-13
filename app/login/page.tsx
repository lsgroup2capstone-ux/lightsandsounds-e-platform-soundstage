import { AuthShell } from "@/components/auth/auth-shell"
import { LoginForm } from "@/components/auth/login-form"

export const metadata = {
  title: "Log in — SoundStage",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; reset?: string; status?: string }> }) {
  const { returnTo, reset, status } = await searchParams
  return (
    <AuthShell title="Access your SoundStage account" subtitle="Sign in securely to manage your bookings or service operations.">
      {status === "suspended" && <p role="alert" className="mb-4 text-sm text-destructive">This account is suspended.</p>}
      {status === "deactivated" && <p role="alert" className="mb-4 text-sm text-destructive">This account is deactivated.</p>}
      {reset === "success" && <p role="status" className="mb-4 text-sm text-success">Your password has been reset. Sign in with your new password.</p>}
      <LoginForm key={reset === "success" ? "after-reset" : "login"} returnTo={returnTo} resetSuccess={reset === "success"} />
    </AuthShell>
  )
}
