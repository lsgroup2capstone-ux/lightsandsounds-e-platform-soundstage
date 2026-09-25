"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { mutate } from "@/lib/app-store"

export function ClearAppDataButton() {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function importData() {
    const records: Record<string, string> = {}
    const allowed = new Set(["soundstage-accounts-v2", "soundstage-marketplace-v1", "soundstage-booking-messages-v1", "soundstage-provider-reports-v1", "soundstage-withdrawals-v1"])
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (allowed.has(key) || key.startsWith("soundstage-client-bookings-v3:") || key.startsWith("soundstage-provider-services-v2:")) {
          records[key] = JSON.stringify(JSON.parse(localStorage.getItem(key)!, (name, value) => /password|token|secret/i.test(name) ? undefined : value))
        }
      }
      const accounts = JSON.parse(records["soundstage-accounts-v2"] || "[]")
      for (const role of ["client", "provider"]) {
        const raw = localStorage.getItem("soundstage-" + role + "-account")
        if (!raw) continue
        const account = JSON.parse(raw, (name, value) => /password|token|secret/i.test(name) ? undefined : value)
        if (!accounts.some((a: { role: string; email: string }) => a.role === account.role && a.email.toLowerCase() === account.email.toLowerCase())) accounts.push(account)
      }
      records["soundstage-accounts-v2"] = JSON.stringify(accounts)
      if (!accounts.length && Object.keys(records).length === 1) { setMessage("No legacy browser data found on this browser and site address."); return }
      if (!window.confirm("Import " + accounts.length + " browser accounts and their associated records into the shared database? This requires an empty app database. Existing browser data will be kept; users must register and verify their emails through Supabase.")) return
      setBusy(true)
      const result = await mutate<{ accounts: number; collections: number }>("importLegacyRecords", [records])
      setMessage("Imported " + result.accounts + " accounts and " + result.collections + " collections. Browser originals were preserved.")
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  return <div className="space-y-2"><Button variant="outline" disabled={busy} onClick={importData}>{busy ? "Importing?" : "Import browser data"}</Button>{message && <p role="status" className="max-w-sm text-sm">{message}</p>}</div>
}
