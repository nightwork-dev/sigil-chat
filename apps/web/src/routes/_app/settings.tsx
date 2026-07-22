// Route: /settings
// Tree:
//   apps/web/src/routes/__root.tsx          — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx             — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/settings.tsx    — THIS FILE
// Content: SettingsPage — Account / Security / Appearance / Agent preferences
// as a vertical section rail INSIDE the existing app chrome (deliberately not
// the standalone @workspace/ui SettingsShell, which owns its own header/
// viewport — nesting it here would duplicate chrome). Notifications is
// hidden until a real notification transport exists (spec, S10.4).

import { createFileRoute } from "@tanstack/react-router"

import {
  SettingsPage,
  type SettingsSection,
} from "@/features/settings/settings-page"
import { fetchLoginMethods } from "@/lib/auth/login-methods"

const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  "account",
  "security",
  "appearance",
  "agent",
]

function isSettingsSection(value: unknown): value is SettingsSection {
  return (
    typeof value === "string" &&
    (SETTINGS_SECTIONS as readonly string[]).includes(value)
  )
}

export const Route = createFileRoute("/_app/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { authError?: string; section: SettingsSection } => ({
    authError:
      typeof search.authError === "string" ? search.authError : undefined,
    section: isSettingsSection(search.section) ? search.section : "account",
  }),
  loader: () => fetchLoginMethods(),
  component: SettingsRoute,
})

function SettingsRoute() {
  const { user } = Route.useRouteContext()
  const { authError, section } = Route.useSearch()
  const loginMethods = Route.useLoaderData()
  const navigate = Route.useNavigate()

  return (
    <SettingsPage
      user={user}
      loginMethods={loginMethods}
      providerLinkError={authError === "provider-link"}
      section={section}
      onSectionChange={(next) => navigate({ search: { section: next } })}
    />
  )
}
