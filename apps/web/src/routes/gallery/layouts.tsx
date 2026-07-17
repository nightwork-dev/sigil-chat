// Route: /gallery/layouts
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/gallery.tsx — SidebarShell chrome (tier nav + theme picker)
//   apps/web/src/routes/gallery/layouts.tsx — THIS FILE
// Content: GalleryTier "layouts" — live previews of every canonical Layout shell.

import { createFileRoute } from "@tanstack/react-router"
import { GalleryTier } from "@/components/gallery"

export const Route = createFileRoute("/gallery/layouts")({
  component: () => <GalleryTier tier="layouts" />,
})
