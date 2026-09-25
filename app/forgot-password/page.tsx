import { AuthShell } from "@/components/auth/auth-shell"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata = {
  title: "Reset password — SoundStage",
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Recover access with a code sent to your email.">
      <ForgotPasswordForm />
    </AuthShell>
  )
}
