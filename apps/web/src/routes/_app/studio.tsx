// Route: /studio
// Tree:
//   apps/web/src/routes/__root.tsx        — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx          — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/studio.tsx   — THIS FILE
// Content: ReducerStudio — typed reducer graph workspace with an overlaid agent HUD

import { createFileRoute } from "@tanstack/react-router"

import { ReducerStudio } from "@/features/studio/reducer-studio"

export const Route = createFileRoute("/_app/studio")({
  component: ReducerStudio,
})
