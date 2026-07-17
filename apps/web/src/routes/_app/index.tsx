// Route: /
// Tree:
//   apps/web/src/routes/__root.tsx — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx   — default app shell
//   apps/web/src/routes/_app/index.tsx — THIS FILE
// Content: redirect into the canonical agentic reducer workspace

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/")({
  beforeLoad: () => {
    throw redirect({ to: "/studio" })
  },
})
