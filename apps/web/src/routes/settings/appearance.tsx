// Route: /settings/appearance
// Tree:
//   apps/web/src/routes/__root.tsx              — HTML shell, providers (no visible chrome)
//   apps/web/src/routes/settings.tsx            — SettingsShell (section nav + pane, theme picker)
//   apps/web/src/routes/settings/appearance.tsx — THIS FILE
// Content: SettingsAppearance — full theme picker (real state, changes the app)

import { createFileRoute } from "@tanstack/react-router"
import { SettingsAppearance } from "@workspace/ui/components/layouts/demos"
import { ThemePickerExpanded } from "@/components/theme-picker"

// The section View is portable; the theme picker is app wiring, injected here.
function AppearanceSection() {
  return (
    <SettingsAppearance>
      <ThemePickerExpanded />
    </SettingsAppearance>
  )
}

export const Route = createFileRoute("/settings/appearance")({
  component: AppearanceSection,
})
