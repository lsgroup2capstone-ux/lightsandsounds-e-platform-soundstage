"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { mutate } from "@/lib/data/app-store"
import { Button } from "@/components/ui/button"

type PaymentStatus = { status: string; kind: string; checkoutUrl?: string }
const messages: Record<string, string> = {
  pending: "Payment processing…",
  paid: "Payment confirmed",
  failed: "Payment failed — you can try again",
  expired: "Checkout expired",
  review: "Payment under review — contact support",
}
const POLL_MS = 3000
const POLL_LIMIT_MS = 120000

// Status comes only from the payments table; this page never marks anything paid (AC17, AC18).
export default function PaymentReturn() {
  const [message, setMessage] = useState("Payment processing…")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PaymentStatus | null>(null)
  const started = useRef(Date.now())
  const id = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("id")
  async function load(action: "getPaymentStatus" | "cancelPayment" = "getPaymentStatus") {
    if (!id) { setMessage("Payment reference is missing."); return null }
    setBusy(true)
    try {
      const next = await mutate<PaymentStatus>(action, [id])
      setResult(next)
      setMessage(messages[next.status] || "Payment processing…")
      return next
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load payment status."); return null }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const poll = async () => {
      const next = await load()
      if (stopped || next?.status !== "pending" || Date.now() - started.current >= POLL_LIMIT_MS) return
      timer = setTimeout(poll, POLL_MS)
    }
    void poll()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [])
  const pending = result?.status === "pending"
  const destination = result?.kind === "subscription" ? "/provider/subscription" : "/dashboard?tab=payments"
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-20"><h1 className="text-4xl font-semibold tracking-tight">PayMongo payment</h1><p role="status" aria-live="polite">{message}</p><div className="flex flex-wrap gap-3">{pending && <Button disabled={busy} onClick={() => void load()}>{busy ? "Checking…" : "Check again"}</Button>}{pending && result?.checkoutUrl && <Button disabled={busy} variant="outline" onClick={() => void load("cancelPayment")}>Cancel checkout</Button>}{pending && result?.checkoutUrl && <Button asChild><a href={result.checkoutUrl}>Resume checkout</a></Button>}<Button asChild variant="outline"><Link href={destination}>Back to account</Link></Button></div></main>
}
