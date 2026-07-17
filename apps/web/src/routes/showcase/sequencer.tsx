// Route: /showcase/sequencer
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — collapsible sidebar (Cmd+B), breadcrumb bar, theme picker
//   apps/web/src/routes/showcase/sequencer.tsx — THIS FILE
// Content: SequencerShowcase — marquee, step sequencer, envelope, spectrum, waveform, patch bay

import { createFileRoute } from "@tanstack/react-router"
import { SequencerShowcase } from "@/components/showcase/sequencer"

export const Route = createFileRoute("/showcase/sequencer")({
  component: SequencerShowcase,
})
