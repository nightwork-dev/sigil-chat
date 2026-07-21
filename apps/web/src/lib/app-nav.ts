// The app's navigation model — single source of truth for BOTH the sidebar
// nav (SidebarShell in _app.tsx) and the Cmd+K omnibar's surface group
// (S1.9 ShellOmnibar). Add or reorder product routes here, once.
//
// Ordering rule (PRODUCT-CHROME-REWORK-SPEC §3.2): CONTAINER-SCOPED surfaces
// first (what you do INSIDE the active project/workspace), then
// PRINCIPAL-LEVEL surfaces (agent definitions, tool catalog — not scoped to
// a container). The portable NavModel is flat by contract, so the grouping
// is expressed through order + the breadcrumb's container segment (which
// omits itself on principal-level routes) — not through a NavModel change.

import {
  FlaskConicalIcon,
  GalleryVerticalEndIcon,
  HouseIcon,
  MapIcon,
  MessageSquareIcon,
  SettingsIcon,
  ActivityIcon,
  UserRoundIcon,
} from "lucide-react"
import type { NavModel } from "@workspace/ui/components/layouts/nav"

export function buildAppNav(options: {
  internalWorkspaces: boolean
  owner?: boolean
}): NavModel {
  return {
    brand: { label: "Sigil Chat", to: "/chat" },
    items: [
      // The product center: conversation and the management session. Review,
      // Evidence, and Artifacts are demo workspaces — reachable from /demos,
      // their tool definitions earmarked for generalization — not
      // front-and-center nav.
      { to: "/home", label: "Home", icon: HouseIcon },
      { to: "/chat", label: "Chat", icon: MessageSquareIcon },
      // Agent management — ONE entry into the management session (Agents |
      // Skills | Capabilities share a tab header in the top rail; principal-
      // level, so the breadcrumb omits the container segment here).
      { to: "/agents", label: "Agents", icon: UserRoundIcon },
      // Kanban is not a demo — the work board is a centered product surface
      // (internal profile until the scoped-rollup spec lands).
      ...(options.internalWorkspaces
        ? [{ to: "/roadmap", label: "Roadmap", icon: MapIcon }]
        : []),
    ],
    footer: [
      // Demos require the authenticated app boundary. Labs are a separate
      // public, local-only island and never mount agent/Gonk resources.
      ...(options.internalWorkspaces
        ? [
            { to: "/demos", label: "Demos", icon: GalleryVerticalEndIcon },
            { to: "/labs", label: "Labs", icon: FlaskConicalIcon },
          ]
        : []),
      ...(options.owner
        ? [{ to: "/status", label: "Status", icon: ActivityIcon }]
        : []),
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  }
}

export const appNav = buildAppNav({
  internalWorkspaces:
    import.meta.env.DEV ||
    import.meta.env.VITE_SIGIL_INTERNAL_WORKSPACES === "1",
})
