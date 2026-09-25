import Link from "next/link"
import { cn } from "@/lib/utils"

export function Logo({ className, href = "/browse", linked = true }: { className?: string; href?: string; linked?: boolean }) {
  const content = (
    <>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 12h1.5" />
          <path d="M8 7v10" />
          <path d="M12 3v18" />
          <path d="M16 7v10" />
          <path d="M20 10v4" />
        </svg>
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        Sound<span className="text-primary">Stage</span>
      </span>
    </>
  )

  if (!linked) return <div className={cn("inline-flex items-center gap-2.5", className)}>{content}</div>

  return <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>{content}</Link>
}
