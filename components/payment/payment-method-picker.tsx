"use client"

import { useId } from "react"
import Image from "next/image"
import { CreditCard, QrCode, Smartphone } from "lucide-react"

export function PaymentMethodPicker({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const name = useId()
  const qr = value.endsWith(" QR")
  const wallet = value.replace(/ QR$/, "")
  const isWallet = wallet === "GCash" || wallet === "Maya"
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="mb-2 text-sm font-medium">Payment method</legend>
    <div className="grid gap-2">
      {["GCash", "Maya", "Credit / Debit card"].map(method => <label key={method} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 focus-within:ring-2 focus-within:ring-primary">
        <input type="radio" name={name} checked={wallet === method} onChange={() => onChange(method === "Credit / Debit card" ? method : `${method} QR`)} className="h-4 w-4 accent-[var(--primary)]" />
        <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ${method === "Credit / Debit card" ? "bg-muted text-foreground" : ""}`}>
          {method === "Credit / Debit card" ? <CreditCard size={26} /> : <Image src={`/payment/${method === "GCash" ? "gcash" : "maya"}.svg`} alt="" width={48} height={48} className="h-full w-full object-contain" />}
        </span>
        <span><span className="block text-sm font-semibold">{method}</span><span className="block text-xs text-muted-foreground">{method === "Credit / Debit card" ? "Secure card checkout" : "Scan a QR code or pay with your wallet"}</span></span>
      </label>)}
    </div>
    {isWallet && <fieldset className="rounded-xl border border-border p-3">
      <legend className="px-1 text-xs font-medium">Pay with {wallet}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10"><input type="radio" name={`${name}-mode`} checked={qr} onChange={() => onChange(`${wallet} QR`)} className="accent-[var(--primary)]" /><QrCode size={18} aria-hidden="true" /><span className="text-sm">Scan QR code</span></label>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10"><input type="radio" name={`${name}-mode`} checked={!qr} onChange={() => onChange(wallet)} className="accent-[var(--primary)]" /><Smartphone size={18} aria-hidden="true" /><span className="text-sm">Wallet checkout</span></label>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{qr ? `Your payment QR code will appear on PayMongo’s secure checkout page. Scan it with ${wallet} to pay the exact amount. QR Ph also accepts other supported banking and wallet apps.` : `Continue to PayMongo, then authorize the payment with ${wallet}.`}</p>
    </fieldset>}
  </fieldset>
}
