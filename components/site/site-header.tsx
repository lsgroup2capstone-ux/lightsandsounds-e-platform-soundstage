"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { UserRound } from "lucide-react"
import { Logo } from "@/components/site/logo"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { Button } from "@/components/ui/button"
import { isLoggedIn } from "@/lib/client-auth"

const nav = [
  { label: "Browse", href: "/browse" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "For providers", href: "/#providers" },
  { label: "Coverage", href: "/#coverage" },
]

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    const refresh = () => setSignedIn(isLoggedIn())
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
            <Button asChild size="sm">
              <Link href="/dashboard"><UserRound width={16} height={16} /> Client profile</Link>
            </Button>
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
