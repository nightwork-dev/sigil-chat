// Route: /gallery/
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/gallery.tsx — SidebarShell chrome (tier nav + theme picker)
//   apps/web/src/routes/gallery/index.tsx — THIS FILE
// Content: none — the bare /gallery index redirects to the first tier tab so
//   the browser always lands on a populated section (Layouts).

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/gallery/")({
  beforeLoad: () => {
    throw redirect({ to: "/gallery/layouts" })
  },
})
