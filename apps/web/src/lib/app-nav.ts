// The app's navigation model — single source of truth for BOTH the sidebar
// nav (SidebarShell in _app.tsx) and the Cmd+K omnibar's workspace search
// (S1.9 ShellOmnibar). Add or reorder product routes here, once.

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
      { to: "/chat", label: "Chat", icon: MessageSquareIcon },
      { to: "/agents", label: "Agent", icon: UserRoundIcon },
      { to: "/capabilities", label: "Capabilities", icon: SparklesIcon },
      { to: "/studio", label: "Studio", icon: NetworkIcon },
      { to: "/evidence", label: "Evidence", icon: LibraryBigIcon },
      { to: "/artifacts", label: "Artifacts", icon: ArchiveIcon },
      ...(options.internalWorkspaces
        ? [
            { to: "/labs", label: "Labs", icon: FlaskConicalIcon },
            { to: "/roadmap", label: "Roadmap", icon: MapIcon },
          ]
        : []),
      { to: "/review", label: "Review", icon: FileCheck2Icon },
      { to: "/skills", label: "Skills", icon: BracesIcon },
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
