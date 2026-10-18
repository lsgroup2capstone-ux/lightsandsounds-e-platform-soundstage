"use client"

import { useEffect } from "react"
import { logout } from "@/lib/auth/client-auth"
import { getClerkBrowser } from "@/lib/auth/clerk-browser"
import { getSupabase } from "@/lib/data/supabase"

const IDLE_LIMIT_MS = 20 * 60 * 1000
const STORAGE_KEY = "soundstage-last-activity"
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const

// Shared through localStorage so activity in any open tab keeps every tab signed in.
function readLastActivity() { try { return Number(localStorage.getItem(STORAGE_KEY)) || Date.now() } catch { return Date.now() } }
function writeLastActivity() { try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch {} }

async function isSignedIn() {
  const [clerk, supabase] = await Promise.allSettled([getClerkBrowser(), getSupabase().auth.getSession()])
  if (clerk.status === "fulfilled" && clerk.value.user) return true
  return supabase.status === "fulfilled" && !!supabase.value.data.session
}

export function IdleLogout() {
  useEffect(() => {
    let lastWrite = 0
    let loggingOut = false
    writeLastActivity()
    const onActivity = () => {
      const now = Date.now()
      if (now - lastWrite < 5000) return
      lastWrite = now
      writeLastActivity()
    }
    const check = async () => {
      if (loggingOut || Date.now() - readLastActivity() < IDLE_LIMIT_MS) return
      loggingOut = true
      try {
        if (await isSignedIn()) {
          await logout()
          location.assign("/login?reason=idle")
        }
      } catch {} finally { writeLastActivity(); loggingOut = false }
    }
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true })
    document.addEventListener("visibilitychange", check)
    const timer = window.setInterval(check, 30_000)
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
      document.removeEventListener("visibilitychange", check)
      window.clearInterval(timer)
    }
  }, [])
  return null
}
