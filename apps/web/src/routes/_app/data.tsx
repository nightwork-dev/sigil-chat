// Route: /data
// Tree:
//   apps/web/src/routes/__root.tsx    — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx      — default app shell (collapsible sidebar + breadcrumb bar + theme picker)
//   apps/web/src/routes/_app/data.tsx — THIS FILE
// Content: EntityBrowserView — table + selection + bulk actions + detail, filling
//   the SidebarShell content region with the shared experiments fixture.

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  EntityBrowserView,
  SAMPLE_EXPERIMENTS,
  experimentColumns,
  renderExperimentDetail,
  type Experiment,
} from "@workspace/ui/components/views/entity-browser"

export const Route = createFileRoute("/_app/data")({
  component: Data,
})

function Data() {
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const data = SAMPLE_EXPERIMENTS.filter((e) => !deletedIds.has(e.id))

  return (
    <EntityBrowserView<Experiment>
      title="Experiments"
      description="A/B tests and their live sample counts. Select rows for bulk actions; open the eye icon for detail."
      data={data}
      columns={experimentColumns}
      renderDetail={renderExperimentDetail}
      onDelete={(item) => setDeletedIds((s) => new Set([...s, item.id]))}
      onBulkDelete={(ids) => setDeletedIds((s) => new Set([...s, ...ids]))}
    />
  )
}
