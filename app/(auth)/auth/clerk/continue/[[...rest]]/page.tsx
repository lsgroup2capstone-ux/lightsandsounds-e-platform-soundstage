"use client"
import { SignIn, useSession } from "@clerk/nextjs"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
export default function ClerkContinue() {
  const { isLoaded, session } = useSession()
  const router = useRouter()
  const complete = session?.status === "active" && !session.currentTask
  useEffect(() => {
    if (isLoaded && complete) router.replace("/auth/clerk/complete")
  }, [isLoaded, complete, router])
  if (!isLoaded || complete) return <main className="p-8" role="status">Completing sign-in...</main>
  return <main className="flex min-h-dvh items-center justify-center p-6"><SignIn routing="path" path="/auth/clerk/continue" signUpUrl="/signup" forceRedirectUrl="/auth/clerk/complete" /></main>
}
