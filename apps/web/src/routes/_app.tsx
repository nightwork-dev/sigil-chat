// Route: pathless app layout (wraps /dashboard, /studio, /review, /chat, /skills, /canvas, and /data)
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx    — THIS FILE
// Chrome: SidebarShell — collapsible icon rail (Cmd+B), breadcrumb bar, theme picker
// Provides: SidebarProvider + h-svh viewport constraint; nav supplied via NavModel (this file is the app adapter)

import { createFileRoute } from "@tanstack/react-router";
import {
  BracesIcon,
  DatabaseIcon,
  FileCheck2Icon,
  LayoutDashboardIcon,
  MapIcon,
  MessageSquareIcon,
  NetworkIcon,
  PenToolIcon,
  SettingsIcon,
} from "lucide-react";
import { SidebarShell, Outlet } from "@workspace/ui/components/layouts/shells";
import type { NavModel } from "@workspace/ui/components/layouts/nav";
import { ThemePicker } from "@/components/theme-picker";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

// The app's nav — the ONLY app-specific thing the portable shell needs.
const nav: NavModel = {
  brand: { label: "Sigil Chat", to: "/studio" },
  items: [
    {
      to: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboardIcon,
      exact: true,
    },
    { to: "/studio", label: "Studio", icon: NetworkIcon },
    { to: "/roadmap", label: "Roadmap", icon: MapIcon },
    { to: "/review", label: "Review", icon: FileCheck2Icon },
    { to: "/chat", label: "Chat", icon: MessageSquareIcon },
    { to: "/skills", label: "Agent library", icon: BracesIcon },
    { to: "/canvas", label: "Canvas", icon: PenToolIcon },
    { to: "/data", label: "Data", icon: DatabaseIcon },
  ],
  footer: [{ to: "/settings", label: "Settings", icon: SettingsIcon }],
};

function AppLayout() {
  return (
    <SidebarShell nav={nav} actions={<ThemePicker variant="compact" />}>
      <Outlet />
    </SidebarShell>
  );
}
