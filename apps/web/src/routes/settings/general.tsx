// Route: /settings/general
// Tree:
//   apps/web/src/routes/__root.tsx           — HTML shell, providers (no visible chrome)
//   apps/web/src/routes/settings.tsx         — SettingsShell (section nav + pane, theme picker)
//   apps/web/src/routes/settings/general.tsx — THIS FILE
// Content: SettingsGeneral — workspace name + billing email fields

import { createFileRoute } from "@tanstack/react-router"
import { SettingsGeneral } from "@workspace/ui/components/layouts/demos"

export const Route = createFileRoute("/settings/general")({
  component: SettingsGeneral,
})
