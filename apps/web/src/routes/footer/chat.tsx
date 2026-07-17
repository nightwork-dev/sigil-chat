// Route: /footer/chat
// Tree:
//   apps/web/src/routes/__root.tsx      — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/footer.tsx      — header tabs, persistent status strip, and theme picker
//   apps/web/src/routes/footer/chat.tsx — THIS FILE
// Content: AppChat — full-page consumer of the shared embeddable agent session

import { createFileRoute } from "@tanstack/react-router"
import { AppChat } from "@/components/app-chat"

export const Route = createFileRoute("/footer/chat")({
  component: AppChat,
})
