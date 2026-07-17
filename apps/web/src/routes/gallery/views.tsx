// Route: /gallery/views
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/gallery.tsx — SidebarShell chrome (tier nav + theme picker)
//   apps/web/src/routes/gallery/views.tsx — THIS FILE
// Content: GalleryTier "views" — live previews of every canonical View surface.

import { createFileRoute } from "@tanstack/react-router"
import { GalleryTier } from "@/components/gallery"

export const Route = createFileRoute("/gallery/views")({
  component: () => <GalleryTier tier="views" />,
})
