// The app's navigation model — single source of truth for BOTH the sidebar
// nav (SidebarShell in _app.tsx) and the Cmd+K omnibar's workspace search
// (S1.9 ShellOmnibar). Add or reorder product routes here, once.

import {
  BracesIcon,
  DatabaseIcon,
  FileCheck2Icon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  MapIcon,
  MessageSquareIcon,
  NetworkIcon,
  PenToolIcon,
} from "lucide-react"
import type { NavModel } from "@workspace/ui/components/layouts/nav"

export const appNav: NavModel = {
  brand: { label: "Sigil Chat", to: "/studio" },
  items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, exact: true },
    { to: "/studio", label: "Studio", icon: NetworkIcon },
    { to: "/evidence", label: "Evidence", icon: LibraryBigIcon },
    { to: "/roadmap", label: "Roadmap", icon: MapIcon },
    { to: "/review", label: "Review", icon: FileCheck2Icon },
    { to: "/chat", label: "Chat", icon: MessageSquareIcon },
    { to: "/skills", label: "Skills", icon: BracesIcon },
    { to: "/canvas", label: "Canvas", icon: PenToolIcon },
    { to: "/data", label: "Data", icon: DatabaseIcon },
  ],
}
