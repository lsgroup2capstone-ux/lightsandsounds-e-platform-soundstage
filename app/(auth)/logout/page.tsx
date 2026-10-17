"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logout } from "@/lib/auth/client-auth"

export default function LogoutPage() {
  const router = useRouter()
  async function confirmLogout() { try { await logout(); router.replace("/login"); router.refresh() } catch (error) { window.dispatchEvent(new CustomEvent("soundstage-error", { detail: error instanceof Error ? error.message : "Could not save changes." })) } }
  return <main className="flex min-h-dvh items-center justify-center bg-background px-4"><div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-xl"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><LogOut width={22} /></span><h1 className="mt-4 text-xl font-semibold">Confirm logout</h1><p className="mt-2 text-sm text-muted-foreground">Are you sure you want to end your current session?</p><div className="mt-6 grid grid-cols-2 gap-3"><Button variant="outline" onClick={() => router.back()}>Cancel</Button><Button variant="destructive" onClick={confirmLogout}>Log out</Button></div></div></main>
}
