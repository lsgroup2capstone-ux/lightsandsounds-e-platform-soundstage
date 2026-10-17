"use client"
// @refresh reset
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginWithEmailAutomatically, loginWithGoogleAutomatically, verifyLoginCode } from "@/lib/auth/client-auth"
export function LoginForm({ returnTo, resetSuccess = false }: { returnTo?: string; resetSuccess?: boolean }) {
  const router = useRouter()
  const signupHref = `/signup${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
  const [showPassword, setShowPassword] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState("")
  const destinationFor = () => `/dashboard${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setError("")
    const data = new FormData(e.currentTarget)
    const email = String(data.get("email") ?? ""), password = String(data.get("password") ?? "")
    try {
      if (returnTo) sessionStorage.setItem("soundstage-google-return-to", returnTo)
      else sessionStorage.removeItem("soundstage-google-return-to")
      const role = await loginWithEmailAutomatically(email, password)
      if (role === "code") { setCodeSent(true); setLoading(false); return }
      if (!role) return
      router.push(destinationFor())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.")
      setLoading(false)
    }
  }
  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setError("")
    try {
      const role = await verifyLoginCode(code)
      if (!role) return
      router.push(destinationFor())
    } catch (err) {
      setError(err instanceof Error ? err.message : "The code could not be verified.")
      setLoading(false)
    }
  }
  if (codeSent) return <form onSubmit={submitCode} className="flex flex-col gap-5">
    <p className="text-sm text-muted-foreground">We sent a verification code to {email.trim().toLowerCase()}. Enter it to finish signing in.</p>
    <div className="flex flex-col gap-2"><Label htmlFor="code">Verification code</Label><Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={event => setCode(event.target.value)} /></div>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <Button type="submit" size="lg" className="glow-primary w-full" disabled={loading}>{loading && <Loader2 width={18} className="animate-spin"/>}Verify and sign in</Button>
    <Button type="button" variant="ghost" onClick={() => { setCodeSent(false); setCode(""); setError("") }} disabled={loading}>Back</Button>
  </form>
  async function googleLogin() { setLoading(true); setError(""); try { await loginWithGoogleAutomatically(returnTo); } catch (err) { setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again."); setLoading(false) } }
  return <div className="flex flex-col gap-6"><form onSubmit={submit} autoComplete={resetSuccess ? "off" : "on"} className="flex flex-col gap-5">
    <div className="flex flex-col gap-2"><Label htmlFor="email">Email address</Label><Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete={resetSuccess ? "off" : "email"} readOnly={resetSuccess && !emailFocused} onFocus={() => setEmailFocused(true)} value={email} onChange={event => setEmail(event.target.value)} /></div><div className="flex flex-col gap-2"><div className="flex justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" onClick={() => sessionStorage.setItem("soundstage-login-email", email.trim().toLowerCase())} className="text-xs font-medium text-primary">Forgot password?</Link></div><div className="relative"><Input id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete={resetSuccess ? "off" : "current-password"} readOnly={resetSuccess && !passwordFocused} onFocus={() => setPasswordFocused(true)} value={password} onChange={event => setPassword(event.target.value)} className="pr-10"/><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Toggle password visibility">{showPassword ? <EyeOff width={18}/> : <Eye width={18}/>}</button></div></div>
    <p className="text-xs text-muted-foreground">Sign in with your registered email and password. Your account type is detected automatically.</p>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <Button type="submit" size="lg" className="glow-primary w-full" disabled={loading}>{loading && <Loader2 width={18} className="animate-spin"/>}Sign in securely</Button>
    {Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && <><div className="relative py-1"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/70"/></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-3 text-muted-foreground">or</span></div></div><Button type="button" variant="outline" size="lg" onClick={googleLogin} disabled={loading}>{loading ? <Loader2 width={18} className="animate-spin"/> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">G</span>}Continue with Google</Button></>}<p className="text-center text-sm text-muted-foreground">Don&apos;t have an account? <Link href={signupHref} className="font-medium text-primary">Sign up</Link></p>
  </form></div>
}
