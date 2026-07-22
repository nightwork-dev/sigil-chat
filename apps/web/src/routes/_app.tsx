// Route: pathless app layout (wraps the authenticated product workspaces)
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
import {
  ContainerBreadcrumb,
  useContainerBreadcrumbPage,
} from "@/components/agent/container-breadcrumb"
import { AgentRailStatus } from "@/components/agent/agent-rail-status"
import { buildAppNav } from "@/lib/app-nav"
import { AgentPrincipalProvider } from "@/lib/agent-principal"
import { ActiveContainerProvider } from "@/lib/active-container"
import { AgentSurfaceProvider } from "@/lib/agent-surface-registry"
import {
  ViewRailChords,
  ViewRailStatusStart,
  ViewRailTop,
} from "@/lib/view-rails"
import "@/components/agent/agent-tool-renderer-bootstrap"

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
  const breadcrumbPage = useContainerBreadcrumbPage()
  const nav = buildAppNav({
    internalWorkspaces:
      import.meta.env.DEV ||
      import.meta.env.VITE_SIGIL_INTERNAL_WORKSPACES === "1",
    owner: user.role === "owner",
  })

  // One rail, one header: the top rail is breadcrumb (always) + the matched
  // route's viewContent (read from staticData via useMatches — SSR-native,
  // no provider). The bottom status rail carries view controls (left), chord
  // hints + agent attention (right). The theme picker lives in the sidebar
  // footer with the account menu, not the rail.
  return (
    <AgentPrincipalProvider principalId={user.id}>
      <ActiveContainerProvider>
        <WorkspaceAttentionProvider>
          <AppAgentSessions principalId={user.id}>
            <AgentSurfaceProvider>
              <SidebarShell
                nav={nav}
                accountMenu={
                  <>
                    <ThemePicker variant="compact" />
                    <AccountMenu user={user} />
                  </>
                }
                breadcrumbContext={<ContainerBreadcrumb />}
                breadcrumbPage={breadcrumbPage}
                viewContent={<ViewRailTop />}
                statusRailStart={<ViewRailStatusStart />}
                statusRailEnd={
                  <>
                    <ViewRailChords />
                    <AgentRailStatus />
                  </>
                }
              >
                <Outlet />
                <ShellAgentHud />
                <ShellOmnibar />
              </SidebarShell>
            </AgentSurfaceProvider>
          </AppAgentSessions>
        </WorkspaceAttentionProvider>
      </ActiveContainerProvider>
    </AgentPrincipalProvider>
  )
}
