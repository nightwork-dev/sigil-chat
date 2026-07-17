// Route: /chat
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx         — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/chat.tsx    — THIS FILE
// Content: AppChat — full-page consumer of the shared embeddable agent session

import { createFileRoute } from "@tanstack/react-router"
import { AppChat } from "@/components/app-chat"

export const Route = createFileRoute("/_app/chat")({
  component: AppChat,
})
