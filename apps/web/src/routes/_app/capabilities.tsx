// Route: /capabilities
// Tree:
//   apps/web/src/routes/__root.tsx              — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx                — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/capabilities.tsx   — THIS FILE
// Content: CapabilitiesWorkspace — authenticated Eve and Gonk capability explanation, grouped by user outcome

import { createFileRoute } from "@tanstack/react-router"

import { CapabilitiesWorkspace } from "@/features/capabilities/capabilities-workspace"

export const Route = createFileRoute("/_app/capabilities")({
  component: CapabilitiesWorkspace,
})
