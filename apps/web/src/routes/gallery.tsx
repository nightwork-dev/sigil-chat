// Route: /gallery/*
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/gallery.tsx — THIS FILE
// Chrome: SidebarShell (the canonical Layout, reused — NOT a fifth shell) —
//   collapsible icon rail (Cmd+B), breadcrumb bar, Components/Examples links +
//   theme picker in the header actions slot.
// Provides: the Layouts / Views / Blocks tier nav; each tier renders as a child
//   route (<Outlet/>). This file is the thin app adapter that feeds the shell a
//   NavModel — the same decoupling contract every shell example uses.

import { createFileRoute } from "@tanstack/react-router"
import { SidebarShell, Outlet } from "@workspace/ui/components/layouts/shells"
import { GlobalNav } from "@/components/global-nav"
import { ThemePicker } from "@/components/theme-picker"
import { TIERS, TIER_ORDER, type TierId } from "@/components/gallery"
import { SITE } from "@/lib/site"
import type { NavModel } from "@workspace/ui/components/layouts/nav"

export const Route = createFileRoute("/gallery")({
  component: GalleryLayout,
})

// Tier nav derived from the ONE gallery taxonomy — sidebar and section headers
// can't disagree because they read the same TIERS map.
const nav: NavModel = {
  brand: { label: SITE.name, to: "/" },
  items: TIER_ORDER.map((id: TierId) => ({
    to: TIERS[id].to,
    label: TIERS[id].label,
    icon: TIERS[id].icon,
  })),
}

function GalleryLayout() {
  return (
    <SidebarShell
      nav={nav}
      actions={
        <>
          <GlobalNav.ComponentsLink />
          <GlobalNav.ExamplesLink />
          <ThemePicker variant="compact" />
        </>
      }
    >
      <Outlet />
    </SidebarShell>
  )
}
