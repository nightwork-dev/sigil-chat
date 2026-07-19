// Route: pathless app layout (wraps /dashboard, /studio, /review, /chat, /skills, /canvas, and /data)
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx    — THIS FILE
// Chrome: SidebarShell — collapsible icon rail (Cmd+B), breadcrumb bar, theme picker
// Provides: SidebarProvider + h-svh viewport constraint; nav supplied via NavModel (this file is the app adapter)
// Protection: beforeLoad resolves the Better Auth session server-side and
// redirects to /login (with a validated same-origin returnTo) when missing —
// this is the protected-application boundary. AppAgentSessions (the Eve
// session provider) is mounted here, INSIDE the boundary, so no unauthenticated
// route ever creates an Eve client or fetches channel data.

import { createFileRoute, redirect } from "@tanstack/react-router"
import { SidebarShell, Outlet } from "@workspace/ui/components/layouts/shells"
import { ThemePicker } from "@/components/theme-picker"
import { AppAgentSessions } from "@/components/agent-sessions"
import { AccountMenu } from "@/components/account-menu"
import { fetchCurrentSession } from "@/lib/auth/route-guard"
import { WorkspaceAttentionProvider } from "@/components/agent/workspace-attention"
import { ShellAgentHud } from "@/components/agent/shell-agent-hud"
import { ShellOmnibar } from "@/components/agent/shell-omnibar"
import { appNav } from "@/lib/app-nav"

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const user = await fetchCurrentSession()
    if (!user) {
      throw redirect({
        to: "/login",
        search: { returnTo: location.href },
      })
    }
    return { user }
  },
  component: AppLayout,
})

function AppLayout() {
  const { user } = Route.useRouteContext()

  return (
    <SidebarShell
      nav={appNav}
      actions={<ThemePicker variant="compact" />}
      accountMenu={<AccountMenu user={user} />}
    >
      <WorkspaceAttentionProvider>
        <AppAgentSessions>
          <Outlet />
          <ShellAgentHud />
          <ShellOmnibar />
        </AppAgentSessions>
      </WorkspaceAttentionProvider>
    </SidebarShell>
  )
}
