"use client"

import { useEffect } from "react"
import { getClerkBrowser } from "@/lib/clerk-browser"

export function AccessRefresh({ to }: { to: string }) {
  useEffect(() => {
    void (async () => {
      const clerk = await getClerkBrowser()
      await clerk.session?.getToken({ skipCache: true })
      location.replace(to)
    })()
  }, [to])

  return <main className="p-8"><p role="status">Updating your access…</p></main>
}
