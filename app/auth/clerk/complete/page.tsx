"use client"
import { useEffect, useRef, useState } from "react"
import { getClerkBrowser } from "@/lib/clerk-browser"
import { getSupabase } from "@/lib/supabase"
import { resetStore } from "@/lib/app-store"
import { finishSignup, getAccount } from "@/lib/client-auth"

export default function ClerkComplete() {
  const [error, setError] = useState("")
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
    const clerk = await getClerkBrowser()
    if (!clerk.session) { location.replace("/login"); return }
    if (clerk.session.currentTask) { location.replace("/auth/clerk/continue"); return }
    const { error } = await getSupabase().auth.signOut()
    if (error) throw error
    resetStore()
    await finishSignup()
    const account = getAccount()
    if (!account) throw new Error("Your account could not be loaded. Please sign in again.")
    const returnTo = sessionStorage.getItem("soundstage-google-return-to")
    const destination = returnTo?.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\") ? returnTo : "/browse"
    for (const key of ["soundstage-google-return-to", "soundstage-oauth-role", "soundstage-signup-email", "soundstage-signup-stage"]) sessionStorage.removeItem(key)
    location.replace(account.role === "provider" ? (account.application?.status === "Approved" ? "/provider" : "/provider/application") : destination)
  })().catch(e => setError(e.message)) }, [])
  return <main className="p-8"><p role={error ? "alert" : "status"}>{error || "Completing sign-in..."}</p>{error && <a href="/login" className="underline">Return to login</a>}</main>
}
