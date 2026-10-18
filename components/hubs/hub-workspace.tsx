"use client"

import { BackupRestore } from "@/components/hubs/admin/backup-restore"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Check, ChevronRight, Lock, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { findSection, hubNav, isProviderPathLocked } from "@/lib/data/hub-data"
import { getAccount, type ClientAccount } from "@/lib/auth/client-auth"
import { EventNotifications } from "@/components/communications/event-notifications"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { publicFileUrl } from "@/lib/data/file-upload"
import { ProviderContent } from "@/components/hubs/provider/provider-content"
import { AdminContent } from "@/components/hubs/admin/admin-content"
import { PayrollContent } from "@/components/hubs/payroll-master/payroll-content"

const hubLabels = {
  provider: { label: "provider hub", home: "/provider", workspace: "Provider workspace", eyebrow: "Provider workspace", fallbackName: "Service provider" },
  admin: { label: "admin hub", home: "/admin", workspace: "Administration", eyebrow: "Platform administration", fallbackName: "Administrator" },
  payroll_master: { label: "payroll master hub", home: "/payroll-master", workspace: "Payroll", eyebrow: "Payroll master", fallbackName: "Payroll master" },
} as const

// Payroll pages not yet built show an empty state.
export function HubWorkspace({ initialPath }: { initialPath: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const section = findSection(pathname || initialPath)
  useEffect(() => {
    let observer: MutationObserver | undefined
    const followTransaction = () => {
      observer?.disconnect()
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id.startsWith("transaction-") && !id.startsWith("activity-")) return
      const scroll = () => { const target = document.getElementById(id); if (!target) return false; target.scrollIntoView({ block: "center", behavior: "smooth" }); target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); return true }
      if (!scroll()) { observer = new MutationObserver(() => { if (scroll()) observer?.disconnect() }); observer.observe(document.body, { childList: true, subtree: true }) }
    }
    followTransaction(); window.addEventListener("hashchange", followTransaction)
    return () => { observer?.disconnect(); window.removeEventListener("hashchange", followTransaction) }
  }, [pathname])
  const nav = hubNav[section.kind]
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const [providerAccount, setProviderAccount] = useState<ClientAccount | null>(null)
  const [adminAccount, setAdminAccount] = useState<ClientAccount | null>(null)
  useEffect(() => { const account = getAccount(); if (section.kind === "admin" && account?.role !== "admin") router.replace("/login"); if (section.kind === "provider" && account?.role !== "provider") router.replace("/login"); if (section.kind === "payroll_master" && account?.role !== "payroll_master") router.replace("/login") }, [router, section.kind])
  useEffect(() => { if (section.kind !== "provider") setAdminAccount(getAccount()) }, [section.kind])
  useEffect(() => {
    if (section.kind !== "provider") return
    const syncProvider = () => setProviderAccount(getAccount())
    syncProvider()
    window.addEventListener("soundstage-account-updated", syncProvider)
    return () => window.removeEventListener("soundstage-account-updated", syncProvider)
  }, [section.kind])
  // Undefined until the account loads, so nothing locks or redirects on a stale first render.
  const providerApproved = providerAccount ? providerAccount.application?.status === "Approved" : undefined
  const locked = (href: string) => section.kind === "provider" && providerApproved === false && isProviderPathLocked(href, false)
  useEffect(() => { if (section.kind === "provider" && providerApproved === false && isProviderPathLocked(pathname || initialPath, false)) router.replace("/provider/application?locked=1") }, [initialPath, pathname, providerApproved, router, section.kind])
  const providerName = providerAccount ? `${providerAccount.firstName} ${providerAccount.lastName}`.trim() || providerAccount.business || "Service provider" : "Service provider"
  const providerInitials = publicFileUrl(providerAccount?.profileImage)
    ? <img src={publicFileUrl(providerAccount?.profileImage)} alt={`${providerName} logo`} className="h-full w-full object-cover" />
    : providerAccount ? `${providerAccount.firstName[0] ?? ""}${providerAccount.lastName[0] ?? ""}`.toUpperCase() : "SP"
  const hub = hubLabels[section.kind]
  const adminName = adminAccount ? `${adminAccount.firstName} ${adminAccount.lastName}` : hub.fallbackName
  const adminInitials = publicFileUrl(adminAccount?.profileImage)
    ? <img src={publicFileUrl(adminAccount?.profileImage)} alt="" className="h-full w-full object-cover" />
    : adminAccount ? `${adminAccount.firstName[0] ?? ""}${adminAccount.lastName[0] ?? ""}`.toUpperCase() || "AD" : "AD"
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2400) }
  return <div className="min-h-screen bg-background"><div className="mx-auto flex max-w-[1440px]"><aside className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-border/70 bg-card/95 p-5 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="flex items-center justify-between"><Link href={hub.home} className="font-display text-xl font-bold tracking-tight">SOUND<span className="text-primary">STAGE</span></Link><Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setMobileOpen(false)}><X width={18} /></Button></div><p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{hub.label}</p><nav className="mt-4 space-y-1">{nav.map(([label, href]) => locked(href) ? <span key={href} aria-disabled="true" title="Available after your application is approved" className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2.5 text-sm text-muted-foreground/50">{label}<Lock width={14} aria-hidden="true" /></span> : <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${pathname === href ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>{label}<ChevronRight width={14} className={pathname === href ? "opacity-100" : "opacity-0"} /></Link>)}</nav><div className="absolute bottom-5 left-5 right-5 rounded-lg border border-border/70 bg-background/70 p-3"><p className="text-xs font-medium">{hub.workspace}</p><p className="mt-1 text-xs text-muted-foreground">Live account data</p></div></aside><main className="min-w-0 flex-1"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-8"><div className="flex items-center gap-3"><Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setMobileOpen(true)}><Menu width={18} /></Button><div><p className="font-display text-sm font-semibold">{section.title}</p><p className="hidden text-xs text-muted-foreground sm:block">Soundstage operations console</p></div></div><div className="flex items-center gap-2"><ThemeToggle />{(section.kind === "admin" || (section.kind === "provider" && providerApproved)) && <EventNotifications />}<div className="hidden h-8 w-px bg-border sm:block" /><div className="flex items-center gap-2 rounded-full bg-card py-1 pl-1 pr-1 text-sm font-medium text-foreground shadow-sm ring-1 ring-border/60 sm:pr-4"><div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-semibold text-primary">{section.kind === "provider" ? providerInitials : adminInitials}</div><span className="hidden max-w-[10rem] truncate sm:block">{section.kind === "provider" ? providerName : adminName}</span></div></div></header><div className="p-4 sm:p-8"><div className="mb-7 flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-sm text-primary">{hub.eyebrow}</p><h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-balance">{section.title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{section.description}</p></div><div className="flex items-center gap-2"></div></div>{notice && <div role="status" className="mb-5 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"><Check width={16} />{notice}</div>}{section.kind === "provider" && providerApproved === false && <div role="status" className="mb-5 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"><Lock width={16} className="mt-0.5 shrink-0" aria-hidden="true" /><p>Your account is awaiting verification. Other features unlock once an administrator approves your application.{providerAccount?.application?.status === "Rejected" && providerAccount.application.reason ? ` Admin feedback: ${providerAccount.application.reason}` : ""}</p></div>}{section.kind === "admin" && <details className="mb-6"><summary className="mb-3 cursor-pointer text-sm font-medium">Backup and restore</summary><BackupRestore /></details>}<div className="space-y-5">{section.kind === "provider" ? <ProviderContent section={section} notify={notify} /> : section.kind === "payroll_master" ? <PayrollContent section={section} /> : <AdminContent section={section} notify={notify} />}</div></div></main></div></div>
}

export default HubWorkspace
