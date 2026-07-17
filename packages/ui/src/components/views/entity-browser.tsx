// View: Entity browser
//
// Canonical CRUD content surface: a PageHeader Block over @workspace/data's
// EntityBrowser (table + selection + bulk actions + detail). Fills any
// Layout's content region (hosted in SidebarShell at /sidebar/data) and is
// reused by the /examples/data catalog — the single definition of "browse a
// collection of entities" for this template.
//
// Decoupled + generic (spec §5): the View names no entity type. Data, columns,
// and handlers arrive via props, so it drops onto any collection. A shared
// sample dataset (SAMPLE_EXPERIMENTS + columns + detail renderer) is exported
// alongside so every host renders the SAME data — delete this file and both
// consumers break (the dedup test).

import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { Meter } from "@workspace/ui/components/meter"
import { ItemRow } from "@workspace/ui/components/item-row"
import { EntityBrowser } from "@workspace/data/components/entity-browser"
import type { Column } from "@workspace/data/components/entity-table"
import { PageHeader } from "@workspace/ui/components/blocks/page-header"

export interface EntityBrowserViewProps<T extends { id: string }> {
  title: string
  /** Read-once page context. Omit on glanceable hosts (ux skill). */
  description?: string
  data: T[]
  columns: Column<T>[]
  renderDetail?: (item: T) => ReactNode
  onDelete?: (item: T) => void
  onBulkDelete?: (ids: string[]) => void
  onExport?: (items: T[]) => void
  onImport?: (data: string) => void
  /** Extra controls in the page header (right side). */
  actions?: ReactNode
  /** Drop the page frame (padding + max width) when embedded in a host that
   *  already owns its page chrome, e.g. the /examples/data catalog. */
  bare?: boolean
  className?: string
}

export function EntityBrowserView<T extends { id: string }>({
  title,
  description,
  data,
  columns,
  renderDetail,
  onDelete,
  onBulkDelete,
  onExport,
  onImport,
  actions,
  bare = false,
  className,
}: EntityBrowserViewProps<T>) {
  const body = (
    <div className={cn("space-y-4", className)}>
      <PageHeader title={title} description={description} actions={actions} />
      {/* No `title` on EntityBrowser — PageHeader already carries it; the
          browser keeps only its dynamic count/selection readout. */}
      <EntityBrowser
        data={data}
        columns={columns}
        renderDetail={renderDetail}
        onDelete={onDelete}
        onBulkDelete={onBulkDelete}
        onExport={onExport}
        onImport={onImport}
      />
    </div>
  )

  if (bare) return body
  return <div className="p-6"><div className="mx-auto max-w-5xl">{body}</div></div>
}

// ── Shared sample fixture (reused by every host; the View stays generic) ─────

export interface Experiment {
  id: string
  name: string
  status: "running" | "completed" | "failed"
  arms: number
  samples: number
  created: string
}

export const SAMPLE_EXPERIMENTS: Experiment[] = [
  { id: "exp-001", name: "Homepage CTA Color", status: "running", arms: 3, samples: 12847, created: "2h ago" },
  { id: "exp-002", name: "Pricing Page Layout", status: "completed", arms: 2, samples: 45230, created: "3d ago" },
  { id: "exp-003", name: "Onboarding Flow v2", status: "running", arms: 4, samples: 8920, created: "5h ago" },
  { id: "exp-004", name: "Search Ranking Model", status: "failed", arms: 2, samples: 1204, created: "1d ago" },
  { id: "exp-005", name: "Email Subject Lines", status: "completed", arms: 5, samples: 67100, created: "1w ago" },
  { id: "exp-006", name: "Checkout Simplification", status: "running", arms: 2, samples: 3450, created: "12h ago" },
]

export const experimentColumns: Column<Experiment>[] = [
  { key: "name", label: "Experiment", className: "font-medium" },
  {
    key: "status",
    label: "Status",
    render: (value) => {
      const status = value as Experiment["status"]
      return (
        <Badge
          variant={status === "failed" ? "destructive" : status === "running" ? "default" : "secondary"}
          className="text-[10px] font-mono"
        >
          {status}
        </Badge>
      )
    },
  },
  { key: "arms", label: "Arms", className: "font-mono text-right" },
  {
    key: "samples",
    label: "Samples",
    className: "font-mono text-right",
    render: (value) => <span>{(value as number).toLocaleString()}</span>,
  },
  { key: "created", label: "Created", className: "text-muted-foreground" },
]

/** Canonical detail renderer for an experiment — reused by every host. */
export function renderExperimentDetail(item: Experiment) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium">{item.name}</div>
        <div className="text-[10px] font-mono text-muted-foreground">{item.id}</div>
      </div>
      <div className="space-y-2">
        <ItemRow>
          <span className="text-muted-foreground">Status</span>
          <span className="ml-auto">
            <StatusDot
              status={item.status === "running" ? "active" : item.status === "failed" ? "danger" : "muted"}
              size="sm"
            />
          </span>
        </ItemRow>
        <ItemRow>
          <span className="text-muted-foreground">Arms</span>
          <span className="ml-auto font-mono">{item.arms}</span>
        </ItemRow>
        <ItemRow>
          <span className="text-muted-foreground">Samples</span>
          <span className="ml-auto font-mono">{item.samples.toLocaleString()}</span>
        </ItemRow>
        <ItemRow>
          <span className="text-muted-foreground">Progress</span>
          <Meter
            value={item.samples}
            max={70000}
            color={item.status === "failed" ? "danger" : item.status === "running" ? "primary" : "positive"}
            className="ml-auto w-24"
          />
        </ItemRow>
      </div>
    </div>
  )
}
