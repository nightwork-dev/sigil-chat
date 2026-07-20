// Route: /status
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, theme/query providers (no visible chrome)
//   apps/web/src/routes/_app.tsx          — protected app shell, sidebar, and shared agent session
//   apps/web/src/routes/_app/status.tsx   — THIS FILE
// Content: StatusWorkspace — owner-only live dependency health and usage visibility

import { createFileRoute, redirect } from "@tanstack/react-router"

import { StatusWorkspace } from "@/features/status/status-workspace"

export const Route = createFileRoute("/_app/status")({
  beforeLoad: ({ context }) => {
    if (context.user.role !== "owner") throw redirect({ to: "/chat" })
  },
  component: StatusWorkspace,
})
