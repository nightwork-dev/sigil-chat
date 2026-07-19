// Route: /evidence
// Tree:
//   apps/web/src/routes/__root.tsx          — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx            — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/evidence.tsx   — THIS FILE
// Content: EvidenceRoom — document library → distilled-cards gallery → ask-with-citations, with selection→agent attention

import { createFileRoute } from "@tanstack/react-router"

import { EvidenceRoom } from "@/features/evidence/evidence-room"

export const Route = createFileRoute("/_app/evidence")({
  component: EvidenceRoom,
})
