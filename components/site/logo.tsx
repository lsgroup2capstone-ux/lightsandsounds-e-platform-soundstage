import Link from "next/link"
import { cn } from "@/lib/utils"

export function Logo({ className, href = "/browse", linked = true }: { className?: string; href?: string; linked?: boolean }) {
  const content = (
    <>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-[9px] bg-foreground text-background">
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
      <span className="text-lg font-semibold tracking-tight text-foreground">
        SoundStage
      </span>
    </>
  )

  if (!linked) return <div className={cn("inline-flex items-center gap-2.5", className)}>{content}</div>

  return <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>{content}</Link>
}
