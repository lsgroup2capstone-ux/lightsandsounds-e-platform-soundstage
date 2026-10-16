"use client"

import { useEffect, useState } from "react"
import { getAccount, getAccountsForAdmin, reviewProviderApplication, submitProviderApplication, uploadProviderDocuments, type ClientAccount, type ProviderDocument } from "@/lib/client-auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { mutate } from "@/lib/app-store"

// Signed links expire after about 5 minutes, so each one is requested on click.
export function Documents({ email, documents }: { email: string; documents: ProviderDocument[] }) {
  const [error, setError] = useState("")
  async function open(index: number) {
    setError("")
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open("", "_blank")
    if (tab) tab.opener = null
    try {
      const { url } = await mutate<{ url: string }>("getProviderDocumentUrl", [email, index])
      if (tab) tab.location.href = url
      else window.open(url, "_blank", "noopener")
    } catch (e) { tab?.close(); setError((e as Error).message || "The document could not be opened.") }
  }
  return <div className="space-y-2">{documents.map((doc, index) => <div key={index} className="rounded-md border p-3"><p className="break-all text-sm">{doc.name}</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => open(index)} aria-label={`Open document ${doc.name}`}>Open document</Button></div>)}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
}
const ACCEPTED = ".pdf,image/jpeg,image/png"
function DropZone({ label, files, onChange, invalid }: { label: string; files: File[]; onChange: (files: File[]) => void; invalid: boolean }) {
  const [over, setOver] = useState(false)
  const id = label.replace(/\W+/g, "-").toLowerCase()
  const add = (list: FileList | null) => { if (list?.length) onChange([...files, ...Array.from(list)]) }
  return <div className="grid gap-2 text-sm">
    <span id={`${id}-label`}>{label} <span className="text-destructive" aria-hidden="true">*</span><span className="sr-only">(required)</span></span>
    <label htmlFor={id} aria-labelledby={`${id}-label`} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }} className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${over ? "border-primary bg-primary/5" : invalid ? "border-destructive" : "border-border hover:border-primary"}`}>
      <span className="font-medium">Drag and drop files here</span>
      <span className="text-xs text-muted-foreground">or click to browse</span>
      <input id={id} type="file" multiple accept={ACCEPTED} className="sr-only" onChange={e => { add(e.target.files); e.target.value = "" }} />
    </label>
    {files.length > 0 && <ul className="space-y-1">{files.map((file, i) => <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5"><span className="break-all">{file.name}</span><button type="button" className="text-xs text-destructive" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remove ${file.name}`}>Remove</button></li>)}</ul>}
    {invalid && <p role="alert" className="text-xs text-destructive">{label} is required.</p>}
  </div>
}
function ApplicationForm({ busy, onSubmit }: { busy: boolean; onSubmit: (files: File[]) => void }) {
  const [permit, setPermit] = useState<File[]>([])
  const [id, setId] = useState<File[]>([])
  const [tried, setTried] = useState(false)
  return <form className="space-y-3" noValidate onSubmit={event => { event.preventDefault(); setTried(true); if (!permit.length || !id.length) return; onSubmit([...permit, ...id]) }}>
    <DropZone label="Business permit / DTI registration" files={permit} onChange={setPermit} invalid={tried && !permit.length} />
    <DropZone label="Valid ID" files={id} onChange={setId} invalid={tried && !id.length} />
    <p className="text-xs text-muted-foreground">Both documents are required. Up to 4 PDF, JPG or PNG files in total, 5 MB each.</p>
    <Button disabled={busy || !permit.length || !id.length} type="submit">{busy ? "Submitting..." : "Submit documents for review"}</Button>
  </form>
}
export function ProviderApplications({ admin = false }: { admin?: boolean }) {
  const [accounts, setAccounts] = useState<ClientAccount[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const refresh = () => { const account = getAccount(); setAccounts(admin ? account?.role === "admin" ? getAccountsForAdmin().filter(a => a.role === "provider").sort((a, b) => (b.application?.submittedAt || "").localeCompare(a.application?.submittedAt || "")) : [] : account?.role === "provider" ? [account] : []) }
    refresh(); window.addEventListener("soundstage-account-updated", refresh); window.addEventListener("storage", refresh)
    return () => { window.removeEventListener("soundstage-account-updated", refresh); window.removeEventListener("storage", refresh) }
  }, [admin])
  return <div className="space-y-4">{message && <p role="status" className="text-sm">{message}</p>}{!accounts.length && <p className="py-8 text-muted-foreground">No provider applications yet.</p>}{accounts.map(account => <Card key={account.email} id={`activity-provider-${account.email}`} className="scroll-mt-24"><CardHeader><CardTitle>{account.business || `${account.firstName} ${account.lastName}`}</CardTitle><p className="text-sm">Application: {account.application?.status || "Documents required"}</p></CardHeader><CardContent className="space-y-4"><div className="text-sm"><p>{account.firstName} {account.lastName}</p><p>{account.email}</p><p>{account.mobile}</p></div>{account.application && <><p className="text-xs text-muted-foreground">Submitted {new Date(account.application.submittedAt).toLocaleString()}</p>{account.application.reviewedAt && <p className="text-xs text-muted-foreground">Reviewed {new Date(account.application.reviewedAt).toLocaleString()}</p>}{account.application.reason && <p className="rounded-md border p-3 text-sm">Admin feedback: {account.application.reason}</p>}<Documents email={account.email} documents={account.application.documents} /></>}{!admin && account.application?.status === "Pending" && <p className="text-sm text-primary">Your account was created. An administrator will review your documents before you can publish services. Your free trial starts after approval.</p>}{!admin && account.application?.status === "Approved" && <p className="text-sm text-success">Approved. You can now publish services and receive bookings.</p>}{!admin && (!account.application || account.application.status === "Rejected") && <ApplicationForm busy={busy} onSubmit={async files => { setBusy(true); try { const documents = await uploadProviderDocuments(files); await submitProviderApplication(documents); setMessage("Documents submitted for administrator review.") } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) } }} />}{admin && account.application?.status === "Pending" && <form className="space-y-3" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); try { await reviewProviderApplication(account.email, String(data.get("decision")) as "Approved" | "Rejected", String(data.get("reason"))); setMessage("Application decision saved in the audit log.") } catch (e) { setMessage((e as Error).message) } }}><label className="grid gap-2 text-sm">Decision<select name="decision" className="rounded-md border bg-background p-2"><option value="Approved">Accept provider</option><option value="Rejected">Reject provider</option></select></label><label className="grid gap-2 text-sm">Review notes (required when rejecting)<Input name="reason" maxLength={500} /></label><Button type="submit">Save review decision</Button></form>}</CardContent></Card>)}</div>
}
