// The app's navigation model — single source of truth for BOTH the sidebar
// nav (SidebarShell in _app.tsx) and the Cmd+K omnibar's workspace search
// (S1.9 ShellOmnibar). Add or reorder product routes here, once.

import {
  BracesIcon,
  FileCheck2Icon,
  LibraryBigIcon,
  MapIcon,
  MessageSquareIcon,
  NetworkIcon,
} from "lucide-react"
import type { NavModel } from "@workspace/ui/components/layouts/nav"

export const appNav: NavModel = {
  brand: { label: "Sigil Chat", to: "/chat" },
  items: [
    { to: "/chat", label: "Chat", icon: MessageSquareIcon },
    { to: "/studio", label: "Studio", icon: NetworkIcon },
    { to: "/evidence", label: "Evidence", icon: LibraryBigIcon },
    { to: "/roadmap", label: "Roadmap", icon: MapIcon },
    { to: "/review", label: "Review", icon: FileCheck2Icon },
    { to: "/skills", label: "Skills", icon: BracesIcon },
  ],
}
