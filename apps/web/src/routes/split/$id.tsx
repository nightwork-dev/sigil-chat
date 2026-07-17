// Route: /split/$id
// Tree:
//   apps/web/src/routes/__root.tsx     — HTML shell, providers (no visible chrome)
//   apps/web/src/routes/split.tsx      — SplitShell + InboxView.Root (controlled selection from this param)
//   apps/web/src/routes/split/$id.tsx  — THIS FILE
// Content: InboxView.Detail — URL-addressable detail pane. The parent route adapter
//   (split.tsx) reads this route's `$id` param and feeds it into InboxView.Root as the
//   controlled `selectedId`, so navigating here directly (or refreshing) deep-links to
//   this record with no client-only state required.

import { createFileRoute } from "@tanstack/react-router"
import { InboxView } from "@workspace/ui/components/views/inbox"

export const Route = createFileRoute("/split/$id")({
  component: SplitDetailRoute,
})

// Thin wrapper: the router's code-splitter needs a plain component reference,
// not a member expression (InboxView.Detail).
function SplitDetailRoute() {
  return <InboxView.Detail />
}
