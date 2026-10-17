"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Logo } from "@/components/site/logo"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { Button } from "@/components/ui/button"
import { getAccount, type ClientAccount } from "@/lib/auth/client-auth"
import { publicFileUrl } from "@/lib/data/file-upload"

const nav = [
  { label: "Browse", href: "/browse" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "For providers", href: "/#providers" },
  { label: "Coverage", href: "/#coverage" },
]

export function SiteHeader() {
  const [account, setAccount] = useState<ClientAccount | null>(null)
  const signedIn = account !== null
  const displayName = account ? `${account.firstName} ${account.lastName}`.trim() || "Client profile" : ""
  const initials = account ? `${account.firstName[0] ?? ""}${account.lastName[0] ?? ""}`.toUpperCase() || "CL" : ""
  const avatarUrl = publicFileUrl(account?.profileImage)

  useEffect(() => {
    const refresh = () => setAccount(getAccount())
    refresh()
    window.addEventListener("soundstage-account-updated", refresh)
    return () => window.removeEventListener("soundstage-account-updated", refresh)
  }, [])

  return (
    <header className="glass sticky top-0 z-40 border-b border-border/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Logo href={signedIn ? "/browse" : "/"} />
        <nav className="hidden items-center gap-7 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] text-foreground/80 transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-full bg-card py-1 pl-1 pr-4 text-sm font-medium text-foreground shadow-sm ring-1 ring-border/60 transition-colors hover:bg-muted"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
              </span>
              <span className="max-w-[10rem] truncate">{displayName}</span>
            </Link>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="h-11 text-muted-foreground hover:text-foreground sm:h-8">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm" className="h-11 sm:h-8">
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
