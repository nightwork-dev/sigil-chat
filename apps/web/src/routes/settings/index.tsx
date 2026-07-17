// Route: /settings
// Tree:
//   apps/web/src/routes/__root.tsx         — HTML shell, providers (no visible chrome)
//   apps/web/src/routes/settings.tsx       — SettingsShell (section nav + pane, theme picker)
//   apps/web/src/routes/settings/index.tsx — THIS FILE
// Content: none — redirects to the first section rather than showing a stub

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/general" })
  },
})
