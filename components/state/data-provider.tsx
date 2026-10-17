"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { refreshStore, resetStore } from "@/lib/data/app-store"
import { getSupabase } from "@/lib/data/supabase"

export function DataProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname.startsWith("/auth/clerk/") || ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-otp", "/auth/callback"].includes(pathname)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setError(""); setAttempt(value => value + 1) }
  useEffect(() => {
    // Auth screens handle their own requests and errors. They must remain
    // accessible even when the application database is unavailable.
    if (isAuthPage) return
    let active = true
    const load = () => refreshStore().then(() => { if (active) { setReady(true); setError("") } }).catch(e => { if (active) setError(e.message) })
    const onError = (e: Event) => setError((e as CustomEvent<string>).detail)
    window.addEventListener("soundstage-error", onError)
    void load()
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") resetStore()
      // Do not call Auth methods inside its state-change callback.
      if (event !== "INITIAL_SESSION") setTimeout(() => { if (active) void load() }, 0)
    })
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load() }, 30000)
    window.addEventListener("focus", load)
    return () => { active = false; subscription.unsubscribe(); clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("soundstage-error", onError) }
  }, [attempt, isAuthPage])
  if (isAuthPage) return <>{children}</>
  // The public landing page can render without database records. Account and
  // marketplace pages must wait for their authorized snapshot to load.
  if (!ready && pathname !== "/") return <main className="flex min-h-dvh items-center justify-center p-8 text-center"><div><p role={error ? "alert" : "status"}>{error || "Loading SoundStage…"}</p>{error && <button className="mt-4 underline" onClick={retry}>Try again</button>}</div></main>
  return <>{error && <div role="alert" className="relative z-50 border-b border-border bg-card p-3 text-center text-sm">{error}<button className="ml-4 underline" onClick={retry}>Try again</button></div>}{children}</>
}
