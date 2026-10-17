"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { mutate } from "@/lib/data/app-store"
import { Button } from "@/components/ui/button"

export default function PaymentReturn() {
  const [message, setMessage] = useState("Checking your PayMongo payment…")
  const [busy, setBusy] = useState(false)
  const [paid, setPaid] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState("")
  const [destination, setDestination] = useState("/dashboard?tab=payments")
  async function verify(cancel = false) {
    const id = new URLSearchParams(window.location.search).get("id")
    if (!id) { setMessage("Payment reference is missing."); return }
    setBusy(true)
    try {
      const result = await mutate<{ paid: boolean; kind: string; cancelled?: boolean; checkoutUrl?: string }>(cancel ? "cancelPayment" : "verifyPayment", [id])
      setPaid(result.paid)
      setCheckoutUrl(result.checkoutUrl || "")
      setDestination(result.kind === "subscription" ? "/provider/subscription" : "/dashboard?tab=payments")
      setMessage(result.paid ? "Payment confirmed. Your receipt is available in your account." : result.cancelled ? "Checkout cancelled. You can start a new booking or subscription payment." : "Payment has not been confirmed. You can resume checkout or check again after paying.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not verify payment.") }
    finally { setBusy(false) }
  }
  useEffect(() => { void verify() }, [])
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-20"><h1 className="text-4xl font-semibold tracking-tight">PayMongo payment</h1><p role="status">{message}</p><div className="flex flex-wrap gap-3">{!paid && <Button disabled={busy} onClick={() => void verify()}>{busy ? "Checking…" : "Check payment"}</Button>}{checkoutUrl && <Button disabled={busy} variant="outline" onClick={() => void verify(true)}>Cancel checkout</Button>}{checkoutUrl && <Button asChild><a href={checkoutUrl}>Resume checkout</a></Button>}<Button asChild variant="outline"><Link href={destination}>Back to account</Link></Button></div></main>
}
