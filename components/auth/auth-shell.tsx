import Image from "next/image"
import { CheckCircle2 } from "lucide-react"
import { Logo } from "@/components/site/logo"

const points = [
  "Verified local providers across Batangas",
  "Live availability and instant booking",
  "Secure GCash, e-wallet & card payments",
]

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-10 lg:flex">
        <Image src="/images/hero-stage.webp" alt="" fill sizes="50vw" className="object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/80 via-background/70 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_10%,rgba(0,229,255,0.14),transparent_65%),radial-gradient(50%_50%_at_90%_90%,rgba(176,38,255,0.14),transparent_60%)]" />
        <div className="relative">
          <Logo href="/" />
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-3xl font-bold leading-tight text-foreground text-balance">
            The centralized home for event lights &amp; sounds.
          </h2>
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-muted-foreground">
                <CheckCircle2 width={18} height={18} className="shrink-0 text-primary" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} SoundStage &middot; Batangas, Philippines
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex w-full flex-col items-center justify-center px-4 py-10 sm:px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo href="/" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
