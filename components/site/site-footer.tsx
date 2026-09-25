import Link from "next/link"
import { Logo } from "@/components/site/logo"

const columns = [
  {
    title: "Platform",
    links: [
      { label: "Browse services", href: "/browse" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/#providers" },
      { label: "Coverage areas", href: "/#coverage" },
    ],
  },
  {
    title: "For providers",
    links: [
      { label: "Become a provider", href: "/signup?role=provider" },
      { label: "Subscription plans", href: "/#providers" },
      { label: "Provider login", href: "/login" },
      { label: "Provider workspace", href: "/provider" },
      { label: "Admin demo", href: "/admin" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help center", href: "/#" },
      { label: "Terms & conditions", href: "/#" },
      { label: "Refund policy", href: "/#" },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The centralized booking platform for lights and sounds providers across Balayan, Nasugbu, and Lian,
              Batangas.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-foreground">{col.title}</h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} SoundStage. A capstone e-platform project.
          </p>
          <p className="text-xs text-muted-foreground">Batangas, Philippines</p>
        </div>
      </div>
    </footer>
  )
}
