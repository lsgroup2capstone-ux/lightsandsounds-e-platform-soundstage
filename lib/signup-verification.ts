import type { User } from "@supabase/supabase-js"

// Only Auth-managed fields can establish verification or exemptions.
export function needsSignupPhoneVerification(user: Pick<User, "app_metadata" | "phone" | "phone_confirmed_at">) {
  if (user.app_metadata.role === "admin" || user.app_metadata.provider === "google") return false
  return !user.phone || !user.phone_confirmed_at
}
