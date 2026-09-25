"use client"
import { useEffect, useState } from "react"
import { getSupabase } from "@/lib/supabase"
import { finishSignup, getAccount } from "@/lib/client-auth"

export default function AuthCallback() {
  const [error, setError] = useState("")
  useEffect(() => { void (async () => {
    const recovery = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery" || new URLSearchParams(location.search).get("flow") === "reset"
    const { data: { session }, error } = await getSupabase().auth.getSession()
    if (error || !session) throw error || new Error("Sign-in did not complete. Please try again.")
    if (recovery) {
      sessionStorage.setItem("soundstage-reset-email", session.user.email!.toLowerCase())
      sessionStorage.setItem("soundstage-reset-attempt", session.user.id)
      location.replace("/reset-password")
      return
    }
    await finishSignup()
    const account = getAccount()
    if (!account) throw new Error("Your account could not be loaded. Please sign in again.")
    const returnTo = sessionStorage.getItem("soundstage-google-return-to")
    for (const key of ["soundstage-google-return-to", "soundstage-oauth-role", "soundstage-signup-email", "soundstage-signup-stage"]) sessionStorage.removeItem(key)
    const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\") ? returnTo : "/browse"
    location.replace(account.role === "admin" ? "/admin" : account.role === "provider" ? (account.application?.status === "Approved" ? "/provider" : "/provider/application") : safeReturnTo)
  })().catch(e => setError(e.message)) }, [])
  return <main className="p-8">{error || "Completing sign-in…"}</main>
}
