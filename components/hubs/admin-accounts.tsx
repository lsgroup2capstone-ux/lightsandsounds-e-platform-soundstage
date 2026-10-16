"use client"

import { useState } from "react"
import Link from "next/link"
import type { ClientAccount } from "@/lib/client-auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { publicFileUrl } from "@/lib/file-upload"
import { Documents } from "./provider-applications"

export function AdminAccounts({ accounts }: { accounts: ClientAccount[] }) {
  const [query, setQuery] = useState("")
  const [role, setRole] = useState("all")
  const visible = accounts.filter(account => (role === "all" || account.role === role) &&
    [account.firstName, account.lastName, account.email, account.mobile, account.business].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())))
  return <Card>
    <CardHeader><CardTitle>All accounts</CardTitle><p className="text-sm text-muted-foreground">Client and service provider profiles stored in this browser. Expand an account to view its details.</p></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-2"><Label htmlFor="account-search">Search accounts</Label><Input id="account-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email, mobile or business" /></div>
        <div className="space-y-2"><Label htmlFor="account-role">Account type</Label><select id="account-role" value={role} onChange={event => setRole(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All accounts</option><option value="client">Clients</option><option value="provider">Service providers</option></select></div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">{visible.length} account{visible.length === 1 ? "" : "s"}</p>
      {!visible.length && <p className="py-6 text-sm text-muted-foreground">{accounts.length ? "No accounts match your search." : "No accounts have been created."}</p>}
      {visible.map(account => <details key={`${account.role}:${account.email}`} className="rounded-lg border p-4">
        <summary className="cursor-pointer break-words font-medium">{account.firstName} {account.lastName} <span className="text-sm font-normal text-muted-foreground">— {({ provider: "Service provider", admin: "Admin", payroll_master: "Payroll master" } as Record<string, string>)[account.role] || "Client"} · {account.email}</span></summary>
        <div className="mt-4 space-y-4">
          {publicFileUrl(account.profileImage) && <img src={publicFileUrl(account.profileImage)} alt={`${account.firstName}'s profile`} className="h-20 w-20 rounded-full object-cover" />}
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {Object.entries({ "First name": account.firstName, "Last name": account.lastName, "Email address": account.email, "Mobile number": account.mobile, "Account type": ({ provider: "Service provider", admin: "Admin", payroll_master: "Payroll master" } as Record<string, string>)[account.role] || "Client", "Sign-in method": account.authMethod, "Password": "Hidden for account security", ...(account.role === "provider" ? { "Business name": account.business, "Bio": account.bio, "Application status": account.application?.status || "Not submitted", "Submitted": account.application?.submittedAt, "Reviewed": account.application?.reviewedAt, "Review notes": account.application?.reason } : {}) }).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || "Not provided"}</dd></div>)}
          </dl>
          {account.application && <div className="space-y-2"><p className="text-sm font-medium">Application documents</p><Documents email={account.email} documents={account.application.documents} /></div>}
          {account.role === "provider" && <Link className="inline-block text-sm text-primary underline" href={`/admin/providers#activity-provider-${account.email}`}>Open provider application</Link>}
        </div>
      </details>)}
    </CardContent>
  </Card>
}
