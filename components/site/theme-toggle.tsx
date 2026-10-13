"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

const storageKey = "soundstage-theme"

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"))
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey) return
      const next = event.newValue === "dark"
      document.documentElement.classList.toggle("dark", next)
      setDark(next)
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem(storageKey, next ? "dark" : "light")
    } catch {}
    setDark(next)
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
    >
      {dark ? <Sun width={18} height={18} /> : <Moon width={18} height={18} />}
    </Button>
  )
}
