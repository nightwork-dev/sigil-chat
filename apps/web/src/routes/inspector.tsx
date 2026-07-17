// Route: /inspector/*
// Tree:
//   apps/web/src/routes/__root.tsx     — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/inspector.tsx  — THIS FILE
// Chrome: InspectorShell — content + collapsible right properties rail (Cmd+.), theme picker
// Provides: h-svh flex-col shell; inspector slot + nav supplied here (app adapter). Content = routed <Outlet/>

import { createFileRoute } from "@tanstack/react-router"
import { InspectorShell, Outlet } from "@workspace/ui/components/layouts/shells"
import { InspectorPanel } from "@workspace/ui/components/layouts/demos"
import type { NavModel } from "@workspace/ui/components/layouts/nav"
import { ThemePicker } from "@/components/theme-picker"

export const Route = createFileRoute("/inspector")({
  component: InspectorLayout,
})

const nav: NavModel = { brand: { label: "App", to: "/" }, items: [] }

function InspectorLayout() {
  return (
    <InspectorShell nav={nav} inspector={<InspectorPanel />} inspectorTitle="Properties" actions={<ThemePicker variant="compact" />}>
      <Outlet />
    </InspectorShell>
  )
}
