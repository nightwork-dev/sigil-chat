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
  ArchiveIcon,
  FileCheck2Icon,
  FlaskConicalIcon,
  LibraryBigIcon,
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
      // Container-scoped — modes of working WITHIN the active project/workspace.
      { to: "/chat", label: "Chat", icon: MessageSquareIcon },
      { to: "/evidence", label: "Evidence", icon: LibraryBigIcon },
      { to: "/artifacts", label: "Artifacts", icon: ArchiveIcon },
      { to: "/review", label: "Review", icon: FileCheck2Icon },
      // Agent management — ONE entry into the management session (Agents |
      // Skills | Capabilities share a tab header in the top rail; principal-
      // level, so the breadcrumb omits the container segment here).
      { to: "/agents", label: "Agents", icon: UserRoundIcon },
    ],
    footer: [
      // Demos and experiments stay reachable, out of the front-and-center
      // nav: the labs island indexes Studio, the roadmap board, and the
      // interaction studies.
      ...(options.internalWorkspaces
        ? [{ to: "/labs", label: "Labs", icon: FlaskConicalIcon }]
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
    import.meta.env.DEV || import.meta.env.VITE_SIGIL_INTERNAL_WORKSPACES === "1",
})
