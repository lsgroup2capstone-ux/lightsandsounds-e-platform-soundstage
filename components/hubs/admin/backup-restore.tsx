"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { mutate } from "@/lib/data/app-store"

type Preview = { createdAt: string; collections: number; accounts: number }
export function BackupRestore() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [backup, setBackup] = useState<unknown>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmation, setConfirmation] = useState("")
  async function download() {
    setBusy(true); setMessage("")
    try {
      const result = await mutate<{ createdAt: string }>("createBackup")
      const url = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: "application/json" }))
      const link = document.createElement("a")
      link.href = url; link.download = `soundstage-backup-${result.createdAt.replace(/[:.]/g, "-")}.json`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage("Backup download started. Keep this file in a secure location; it contains private customer data.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Backup failed.") }
    finally { setBusy(false) }
  }
  async function selectFile(file?: File) {
    setBackup(null); setPreview(null); setConfirmation(""); setMessage("")
    if (!file) return
    setBusy(true)
    try {
      if (file.size > 11000000) throw new Error("Backup file is too large (maximum 11 MB).")
      const value: unknown = JSON.parse(await file.text())
      const result = await mutate<Preview>("previewBackup", [value])
      setBackup(value); setPreview(result)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not read backup.") }
    finally { setBusy(false) }
  }
  async function restore() {
    setBusy(true); setMessage("")
    try {
      await mutate("restoreBackup", [backup, confirmation])
      setPreview(null); setBackup(null); setConfirmation("")
      setMessage("Backup restored successfully. App data has been refreshed.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Restore failed.") }
    finally { setBusy(false) }
  }
  return <Card className="mb-6"><CardHeader><CardTitle>Backup and restore</CardTitle><p className="text-sm text-muted-foreground">Save app profiles, bookings, services, payments, messages, and settings. Sign-in accounts, passwords, and externally hosted files are not included.</p></CardHeader><CardContent className="space-y-4">
    <Button variant="outline" disabled={busy} onClick={download}>Download backup</Button>
    <div className="space-y-2"><label htmlFor="restore-backup" className="text-sm font-medium">Select a backup to restore</label><Input id="restore-backup" type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void selectFile(file) }} /></div>
    {preview && <div className="space-y-3 rounded-lg border p-4"><p className="text-sm">Verified backup from {new Date(preview.createdAt).toLocaleString()}: {preview.accounts} app profiles, {preview.collections} record collections.</p><p className="text-sm">Restoring replaces current app data, including changes made after this backup. Download a current backup first. Administrator access and sign-in accounts are preserved.</p><label htmlFor="restore-confirmation" className="block text-sm font-medium">Type RESTORE to confirm</label><Input id="restore-confirmation" value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /><Button variant="destructive" disabled={busy || confirmation !== "RESTORE"} onClick={restore}>Restore backup</Button></div>}
    {busy && <p role="status" className="text-sm">Processing backup…</p>}{message && <p role="status" className="text-sm">{message}</p>}
  </CardContent></Card>
}
