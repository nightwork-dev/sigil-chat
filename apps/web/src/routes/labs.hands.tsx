// Route: /labs/hands
// Tree:
//   apps/web/src/routes/__root.tsx     — HTML shell and theme/query providers (no visible chrome)
//   apps/web/src/routes/labs.tsx       — experimental labs boundary (no visible chrome)
//   apps/web/src/routes/labs.hands.tsx — THIS FILE
// Content: HandsLab — quarantined product-adjacent webcam hand-interaction accuracy spike; experimental chrome, no product navigation or attention wiring

import { createFileRoute } from "@tanstack/react-router"

import { HandsLab } from "@/features/labs/hands/hands-lab"

export const Route = createFileRoute("/labs/hands")({
  component: HandsLab,
})
