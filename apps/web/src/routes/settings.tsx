// Route: /settings/*
// Tree:
//   apps/web/src/routes/__root.tsx    — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/settings.tsx  — THIS FILE
// Chrome: SettingsShell — section nav (left) + section pane (Outlet), theme picker
// Provides: h-svh flex-col shell; section nav supplied here (app adapter). Section = routed <Outlet/>

import { createFileRoute } from "@tanstack/react-router"
import { SlidersHorizontalIcon, PaletteIcon, BellIcon } from "lucide-react"
import { SettingsShell, Outlet } from "@workspace/ui/components/layouts/shells"
import type { NavModel } from "@workspace/ui/components/layouts/nav"
import { ThemePicker } from "@/components/theme-picker"

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
})

// Sections ARE the nav model — the shell renders them as the left rail.
const nav: NavModel = {
  brand: { label: "App", to: "/" },
  items: [
    { to: "/settings/general", label: "General", icon: SlidersHorizontalIcon },
    { to: "/settings/appearance", label: "Appearance", icon: PaletteIcon },
    { to: "/settings/notifications", label: "Notifications", icon: BellIcon },
  ],
}

function SettingsLayout() {
  return (
    <SettingsShell nav={nav} actions={<ThemePicker variant="compact" />}>
      <Outlet />
    </SettingsShell>
  )
}
