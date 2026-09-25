import type { Clerk } from "@clerk/nextjs/types"

export async function getClerkBrowser() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new Error("Sign-in is not configured. Add the Clerk keys and restart the app.")
  const { getToken } = await import("@clerk/nextjs")
  await getToken() // Wait for Clerk's browser SDK to initialize.
  const clerk = (window as unknown as { Clerk?: Clerk }).Clerk
  if (!clerk?.loaded) throw new Error("Sign-in could not load. Please refresh and try again.")
  return clerk
}

export async function signOutClerk() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return
  const clerk = await getClerkBrowser()
  if (clerk.session) await clerk.signOut(() => {})
}
