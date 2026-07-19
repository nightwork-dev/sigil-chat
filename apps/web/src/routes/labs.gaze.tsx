// Route: /labs/gaze
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell and theme/query providers (no visible chrome)
//   apps/web/src/routes/labs.gaze.tsx — THIS FILE
// Content: GazeLab — quarantined product-adjacent webcam gaze accuracy spike; experimental chrome, no product navigation or attention wiring

import { createFileRoute } from "@tanstack/react-router"

import { GazeLab } from "@/features/labs/gaze/gaze-lab"

export const Route = createFileRoute("/labs/gaze")({
  component: GazeLab,
})
