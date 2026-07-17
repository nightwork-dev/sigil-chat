// Route: /settings/notifications
// Tree:
//   apps/web/src/routes/__root.tsx                 — HTML shell, providers (no visible chrome)
//   apps/web/src/routes/settings.tsx               — SettingsShell (section nav + pane, theme picker)
//   apps/web/src/routes/settings/notifications.tsx — THIS FILE
// Content: SettingsNotifications — per-event email toggles

import { createFileRoute } from "@tanstack/react-router"
import { SettingsNotifications } from "@workspace/ui/components/layouts/demos"

export const Route = createFileRoute("/settings/notifications")({
  component: SettingsNotifications,
})
