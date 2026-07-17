// Route: /showcase/guide
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/guide.tsx — THIS FILE
// Content: GuideShowcase — GuideShell two-pane scroll-spy docs shell + document/review minimaps and scroll-spy exhibits (owns its own inner scroll div, not <main> — see extending-this-template skill)

import { createFileRoute } from "@tanstack/react-router"
import { GuideShowcase } from "@/components/showcase/guide"

export const Route = createFileRoute("/showcase/guide")({
  component: GuideShowcase,
})
