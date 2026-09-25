import { AuthShell } from "@/components/auth/auth-shell"
import { OtpForm } from "@/components/auth/otp-form"

export const metadata = {
  title: "Verify code — SoundStage",
}

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; flow?: string; returnTo?: string }>
}) {
  const { role, flow, returnTo } = await searchParams
  const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/browse"
  const redirectTo = flow === "reset" ? "/reset-password" : role === "provider" ? "/provider/application" : safeReturnTo
  const subtitle =
    flow === "reset"
      ? "Enter the reset code we sent to your email address."
      : "Verify your email address to complete signup."

  return (
    <AuthShell title={flow === "reset" ? "Verify reset code" : "Verify your account"} subtitle={subtitle.trim()}>
      <OtpForm redirectTo={redirectTo} flow={flow === "reset" ? "reset" : undefined} />
    </AuthShell>
  )
}
