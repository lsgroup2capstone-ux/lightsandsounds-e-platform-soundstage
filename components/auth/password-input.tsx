"use client"

import { useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"

export function PasswordInput(props: ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false)
  return <div className="relative">
    <Input {...props} type={visible ? "text" : "password"} className={`pr-12 ${props.className ?? ""}`} />
    <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} aria-controls={props.id} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground">
      {visible ? <EyeOff width={18} /> : <Eye width={18} />}
    </button>
  </div>
}
