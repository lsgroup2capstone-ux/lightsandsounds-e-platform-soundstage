"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Loader2, Store, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { loginWithGoogle, savePendingAccount } from "@/lib/client-auth"

import { PasswordInput } from "@/components/auth/password-input"
import { PASSWORD_REQUIREMENTS, validatePassword } from "@/lib/password-policy"

type Role = "client" | "provider"

const roles: { id: Role; label: string; desc: string; icon: typeof User }[] = [
  { id: "client", label: "Client", desc: "Book lights & sounds for my events", icon: User },
  { id: "provider", label: "Provider", desc: "List my services and get bookings", icon: Store },
]

export function SignupForm({ initialRole = "client", returnTo }: { initialRole?: Role; returnTo?: string }) {
  const router = useRouter()
  const destination = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/browse"
  const loginHref = `/login?returnTo=${encodeURIComponent(destination)}`
  const [role, setRole] = useState<Role>(initialRole)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")


  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
    // Clerk verifies email ownership before creating an app session.
    const data = new FormData(e.currentTarget)
    validatePassword(String(data.get("password") || ""))
    if (data.get("password") !== data.get("confirmation")) {
      e.currentTarget.querySelector<HTMLInputElement>("#confirmation")?.focus()
      throw new Error("Passwords do not match. Please confirm your password again.")
    }
    const signedIn = await savePendingAccount({ firstName: String(data.get("firstName")), lastName: String(data.get("lastName")), email: String(data.get("email")), mobile: String(data.get("mobile")), role, business: String(data.get("business") || "") || undefined, authMethod: "email" }, String(data.get("password")))
    router.push(signedIn ? (role === "provider" ? "/provider/application" : destination) : `/verify-otp?role=${role}&returnTo=${encodeURIComponent(destination)}`)
    } catch (err) { setError(err instanceof Error ? err.message : "Account could not be saved."); setLoading(false) }
  }

  async function handleGoogleSignup() {
    setLoading(true)
    setError("")
    try {
      await loginWithGoogle(role, role === "client" ? destination : undefined)

    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Account type</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {roles.map((r) => {
            const active = role === r.id
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                  active
                    ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(0,229,255,0.35)]"
                    : "border-border/70 bg-card hover:border-border",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <r.icon width={18} height={18} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-foreground">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" placeholder="Juan" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" placeholder="dela Cruz" required />
        </div>
      </div>

      {role === "provider" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="business">Business name</Label>
          <Input id="business" name="business" placeholder="e.g. Balayan Beats Productions" required />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mobile">Mobile number</Label>
        <Input id="mobile" name="mobile" type="tel" placeholder="+63 9XX XXX XXXX" required autoComplete="tel" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" type="password" placeholder="Create a password" required autoComplete="new-password" minLength={8} aria-describedby="password-requirements" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmation">Confirm password</Label>
        <PasswordInput id="confirmation" name="confirmation" placeholder="Re-enter your password" required autoComplete="new-password" minLength={8} aria-describedby="password-requirements" />
        <p id="password-requirements" className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS}</p>
      </div>

      {role === "provider" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            After signing in, upload your DTI / business permit and valid ID for review. Your 7-day free trial starts after administrator approval. No automatic charges. Providers are reviewed by our admin team before going live.
          </p>
        </div>
      )}



      <div id="clerk-captcha" />

      <Button type="submit" size="lg" className="glow-primary mt-1 w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 width={18} height={18} className="animate-spin" />
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>

      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && <>
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-border/70" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-background px-3 text-muted-foreground">or</span>
        </div>
      </div>

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleGoogleSignup} disabled={loading}>
        {loading ? <Loader2 width={18} height={18} className="animate-spin" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">G</span>}
        Continue with Google
      </Button>
      </>}

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        By signing up you agree to our <span className="text-foreground">Terms &amp; Conditions</span> and{" "}
        <span className="text-foreground">Refund Policy</span>.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-primary hover:text-primary/80">
          Log in
        </Link>
      </p>
    </form>
  )
}
