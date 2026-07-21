// Route: /demos/evidence
// Tree:
//   apps/web/src/routes/__root.tsx             — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx               — authenticated product shell and shared agent session
//   apps/web/src/routes/_app/demos.evidence.tsx — THIS FILE
// Content: EvidenceRoom — authenticated corpus, distillation, and citation demonstration

import { createFileRoute } from "@tanstack/react-router"

import { EvidenceRoom } from "@/features/evidence/evidence-room"

export const Route = createFileRoute("/_app/demos/evidence")({
  component: EvidenceRoom,
})
