// Route: /split
// Tree:
//   apps/web/src/routes/__root.tsx      — HTML shell, providers (no visible chrome)
//   apps/web/src/routes/split.tsx       — SplitShell + InboxView.Root (controlled selection: no $id param here)
//   apps/web/src/routes/split/index.tsx — THIS FILE
// Content: InboxView.Detail — at the bare /split index there is no `$id` param, so the
//   parent adapter feeds `selectedId=null` and Detail renders its own "nothing selected"
//   empty state. Clicking a row (or visiting /split/$id) navigates to the $id route instead.

import { createFileRoute } from "@tanstack/react-router"
import { InboxView } from "@workspace/ui/components/views/inbox"

export const Route = createFileRoute("/split/")({
  component: SplitDetailPane,
})

// Thin wrapper: the router's code-splitter needs a plain component reference,
// not a member expression (InboxView.Detail).
function SplitDetailPane() {
  return <InboxView.Detail />
}
