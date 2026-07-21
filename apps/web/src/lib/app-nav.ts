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
  BracesIcon,
  FileCheck2Icon,
  FlaskConicalIcon,
  LibraryBigIcon,
  MapIcon,
  MessageSquareIcon,
  NetworkIcon,
  SettingsIcon,
  SparklesIcon,
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
      // Principal-level — agent definitions and the tool catalog; not scoped
      // to a container (the breadcrumb omits the container segment here).
      { to: "/agents", label: "Agent", icon: UserRoundIcon },
      { to: "/capabilities", label: "Capabilities", icon: SparklesIcon },
      { to: "/studio", label: "Studio", icon: NetworkIcon },
      { to: "/skills", label: "Skills", icon: BracesIcon },
      ...(options.internalWorkspaces
        ? [
            { to: "/labs", label: "Labs", icon: FlaskConicalIcon },
            { to: "/roadmap", label: "Roadmap", icon: MapIcon },
          ]
        : []),
    ],
    footer: [
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
