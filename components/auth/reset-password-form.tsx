"use client"

import Link from "next/link"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/auth/password-input"
import { Label } from "@/components/ui/label"
import { completePasswordReset } from "@/lib/auth/client-auth"

export function ResetPasswordForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const password = String(data.get("password") || "")
    const confirmation = String(data.get("confirmation") || "")
    if (password !== confirmation) return setError("Passwords do not match.")
    setLoading(true)
    setError("")
    try {
      if (!await completePasswordReset(password)) {
        setError("Your reset session is invalid. Request a new reset email and verify its code.")
        return
      }
      form.reset()
      // Load a fresh sign-in page after both authentication sessions have ended.
      window.location.replace("/login?reset=success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not reset your password. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return <form onSubmit={submit} className="flex flex-col gap-5">
    <div className="flex flex-col gap-2"><Label htmlFor="password">New password</Label><PasswordInput id="password" name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
    <div className="flex flex-col gap-2"><Label htmlFor="confirmation">Confirm new password</Label><PasswordInput id="confirmation" name="confirmation" type="password" minLength={8} required autoComplete="new-password" /></div>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <Link href="/forgot-password" className="text-sm text-primary">Request a new reset code</Link>
    <Button type="submit" size="lg" className="glow-primary w-full" disabled={loading}>{loading && <Loader2 width={18} className="animate-spin" />}Reset password</Button>
  </form>
}
