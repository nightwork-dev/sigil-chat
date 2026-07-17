// Route: /examples/*
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx — THIS FILE
// Chrome: global nav strip (wordmark + Components/Examples links + theme picker)
// Provides: nothing else — children own their own scroll/layout entirely

import { createFileRoute, Outlet } from "@tanstack/react-router"
import { GlobalNav } from "@/components/global-nav"

export const Route = createFileRoute("/examples")({
  component: ExamplesLayout,
})

function ExamplesLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <GlobalNav.Strip />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
