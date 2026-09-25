"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset } from "@/lib/client-auth"

export function ForgotPasswordForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  useEffect(() => { setEmail(sessionStorage.getItem("soundstage-login-email") || "") }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      await requestPasswordReset(email)
      sessionStorage.removeItem("soundstage-login-email")
      router.push("/verify-otp?flow=reset")
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not send the reset email.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Registered email address</Label>
        <Input id="email" type="email" placeholder="you@gmail.com" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <p className="text-xs text-muted-foreground">We&apos;ll email you a 6-digit password-reset code.</p>
      </div>

      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <Button type="submit" size="lg" className="glow-primary w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 width={18} height={18} className="animate-spin" />
            Sending code...
          </>
        ) : (
          "Send reset code"
        )}
      </Button>

      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
      >
        <ArrowLeft width={16} height={16} />
        Back to log in
      </Link>
    </form>
  )
}
