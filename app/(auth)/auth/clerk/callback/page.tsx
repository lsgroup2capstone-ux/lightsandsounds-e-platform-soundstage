"use client"
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"
export default function ClerkCallback() {
  return <AuthenticateWithRedirectCallback signInUrl="/auth/clerk/continue" signUpUrl="/auth/clerk/signup" signInForceRedirectUrl="/auth/clerk/complete" signUpForceRedirectUrl="/auth/clerk/complete" />
}
