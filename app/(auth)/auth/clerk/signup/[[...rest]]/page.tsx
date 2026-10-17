"use client"
import { SignUp } from "@clerk/nextjs"
export default function ClerkSignup() {
  return <main className="flex min-h-dvh items-center justify-center p-6"><SignUp routing="path" path="/auth/clerk/signup" signInUrl="/login" forceRedirectUrl="/auth/clerk/complete" /></main>
}
