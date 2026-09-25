"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { verifyPasswordResetCode, verifyPendingAccount, resendVerification, requestPasswordReset } from "@/lib/client-auth"

const LENGTH = 6

export function OtpForm({ redirectTo = "/dashboard", flow }: { redirectTo?: string; flow?: "reset" }) {
  const router = useRouter()
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""))
  const [loading, setLoading] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState("")
  const [resetEmail, setResetEmail] = useState("")
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => {
    if (flow === "reset") {
      const email = sessionStorage.getItem("soundstage-reset-email")
      if (!email) { router.replace("/forgot-password"); return }
      setResetEmail(email)
      setSeconds(60)
    }
    if (flow !== "reset" && !sessionStorage.getItem("soundstage-signup-email")) router.replace("/signup")
  }, [flow, router])
  useEffect(() => {
    if (seconds <= 0) return
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds])

  const complete = digits.every((d) => d !== "")

  function setDigit(i: number, value: string) {
    const char = value.replace(/\D/g, "").slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[i] = char
      return next
    })
    if (char && i < LENGTH - 1) inputs.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH)
    if (!pasted) return
    const next = Array(LENGTH).fill("")
    pasted.split("").forEach((c, idx) => (next[idx] = c))
    setDigits(next)
    inputs.current[Math.min(pasted.length, LENGTH - 1)]?.focus()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!complete || loading) return
    setLoading(true)
    setError("")
    try {
      const valid = flow === "reset" ? await verifyPasswordResetCode(digits.join("")) : await verifyPendingAccount(digits.join(""))
      if (!valid) { setError("That code is incorrect or expired."); return }
      router.push(redirectTo)
    } catch (e) {
      setError((e as Error).message)
      const retryAfter = (e as Error & { retryAfter?: number }).retryAfter
      if (retryAfter) setSeconds(retryAfter)
    } finally { setLoading(false) }
  }

  async function resend() {
    if (loading || seconds > 0) return
    setLoading(true)
    setError("")
    try {
      if (flow === "reset") await requestPasswordReset(sessionStorage.getItem("soundstage-reset-email") || "")
      else {
        await resendVerification()
      }
      setDigits(Array(LENGTH).fill(""))
      sessionStorage.removeItem("soundstage-signup-delivery-error")
      setSeconds(60)
    } catch (e) {
      setError((e as Error).message)
      const retryAfter = (e as Error & { retryAfter?: number }).retryAfter
      if (retryAfter) setSeconds(retryAfter)
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {flow === "reset" && <p className="text-center text-sm text-muted-foreground">Enter the password reset code sent to <span className="font-medium text-foreground">{resetEmail}</span>.</p>}
      {flow !== "reset" && <p role="status" className="text-center text-sm text-muted-foreground">Enter the verification code from your email.</p>}
      <div className="flex justify-between gap-2" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            disabled={loading}
            maxLength={1}
            value={digit}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            aria-label={`Digit ${i + 1}`}
            className="h-14 w-full rounded-lg border border-border bg-card text-center font-display text-2xl font-semibold text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/40"
          />
        ))}
      </div>

      <Button type="submit" size="lg" className="glow-primary w-full" disabled={!complete || loading}>
        {loading ? (
          <>
            <Loader2 width={18} height={18} className="animate-spin" />
            Verifying...
          </>
        ) : (
          "Verify code"
        )}
      </Button>
      {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}

      <p className="text-center text-sm text-muted-foreground">
        {"Didn't get a code? "}
        {seconds > 0 ? (
          <span className="text-muted-foreground">Resend in {seconds}s</span>
        ) : (
          <button type="button" disabled={loading} onClick={resend} className="font-medium text-primary hover:text-primary/80">
            Resend code
          </button>
        )}
      </p>
    </form>
  )
}
