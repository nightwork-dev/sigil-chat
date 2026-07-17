// Route: /footer/*
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/footer.tsx  — THIS FILE
// Chrome: FooterShell — header tab nav + 24px status strip, theme picker
// Provides: h-svh flex-col shell; nav + status content supplied via slots (this file is the app adapter)

import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Separator } from "@workspace/ui/components/separator"
import { WifiIcon } from "lucide-react"
import { FooterShell, Outlet } from "@workspace/ui/components/layouts/shells"
import type { NavModel } from "@workspace/ui/components/layouts/nav"
import { ThemePicker } from "@/components/theme-picker"

export const Route = createFileRoute("/footer")({
  component: FooterLayout,
})

const nav: NavModel = {
  brand: { label: "App", to: "/" },
  items: [
    { to: "/footer", label: "Dashboard", exact: true },
    { to: "/footer/chat", label: "Chat" },
  ],
}

// Client-only clock: rendering `new Date()` during SSR would hydrate to a
// different minute on the client (a hydration mismatch warning). Start null,
// fill in on mount, tick once a minute. A live interval is a legitimate effect.
function Clock() {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  return <span className="ml-auto tabular-nums">{time ?? "--:--"}</span>
}

function StatusStrip() {
  return (
    <>
      <span className="flex items-center gap-1">
        <WifiIcon className="size-2.5 text-success" />
        connected
      </span>
      <Separator orientation="vertical" className="h-3" />
      <span>claude-3.5-sonnet</span>
      <Separator orientation="vertical" className="h-3" />
      <span>4,096 tokens</span>
      <Clock />
    </>
  )
}

function FooterLayout() {
  return (
    <FooterShell nav={nav} status={<StatusStrip />} actions={<ThemePicker variant="compact" />}>
      <Outlet />
    </FooterShell>
  )
}
