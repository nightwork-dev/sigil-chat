// Route: /
// Tree:
//   apps/web/src/routes/__root.tsx — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx   — default app shell
//   apps/web/src/routes/_app/index.tsx — THIS FILE
// Content: redirect into the primary workspace (chat). Until S10.4's
// last-workspace setting exists, this is a static landing target.

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/")({
  beforeLoad: () => {
    throw redirect({ to: "/chat" })
  },
})
