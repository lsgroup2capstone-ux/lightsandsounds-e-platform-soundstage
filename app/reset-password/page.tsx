import { AuthShell } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata = { title: "Choose a new password — SoundStage" }

export default function ResetPasswordPage() {
  return <AuthShell title="Choose a new password" subtitle="Use at least 8 characters for your new password."><ResetPasswordForm /></AuthShell>
}
