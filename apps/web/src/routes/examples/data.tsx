// Route: /examples/data
// Tree:
//   apps/web/src/routes/__root.tsx    — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx  — global nav strip (wordmark + Components/Examples + theme picker)
//   apps/web/src/routes/examples/data.tsx — THIS FILE
// Content: @workspace/data component catalog — EntityTable, EntityBrowser, DetailPanel.
//   The EntityBrowser section COMPOSES the canonical EntityBrowserView (bare) and
//   every section reuses the shared experiments fixture from that View — no local
//   copy (spec §3 dedup). Deleting views/entity-browser.tsx breaks this route.

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"

import { DetailPanel } from "@workspace/data/components/detail-panel"
import { EntityTable } from "@workspace/data/components/entity-table"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { Meter } from "@workspace/ui/components/meter"

import {
  EntityBrowserView,
  SAMPLE_EXPERIMENTS,
  experimentColumns,
  renderExperimentDetail,
  type Experiment,
} from "@workspace/ui/components/views/entity-browser"

export const Route = createFileRoute("/examples/data")({
  component: DataPreview,
})

function DataPreview() {
  const [selectedItem, setSelectedItem] = useState<Experiment | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())

  const liveData = SAMPLE_EXPERIMENTS.filter((e) => !deletedIds.has(e.id))

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl space-y-8 animate-fade-up">
        <div className="space-y-1">
          <h1 className="text-xl font-medium">Data Components</h1>
          <p className="text-sm text-muted-foreground">
            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">@workspace/data</code> — tables, browsers, detail panels
          </p>
        </div>

        {/* EntityTable */}
        <section className="space-y-3">
          <SectionTitle>EntityTable — generic table with selection</SectionTitle>
          <ImportLine>{'import { EntityTable } from "@workspace/data/components/entity-table"'}</ImportLine>
          <EntityTable
            columns={experimentColumns}
            data={liveData.slice(0, 4)}
            onView={(row) => setSelectedItem(row)}
            onDelete={(row) => setDeletedIds((s) => new Set([...s, row.id]))}
          />
        </section>

        <Separator />

        {/* EntityBrowser — via the canonical EntityBrowserView (bare) */}
        <section className="space-y-3">
          <SectionTitle>EntityBrowserView — full CRUD with selection + detail</SectionTitle>
          <ImportLine>{'import { EntityBrowserView } from "@workspace/ui/components/views/entity-browser"'}</ImportLine>
          <EntityBrowserView<Experiment>
            bare
            title="Experiments"
            data={liveData}
            columns={experimentColumns}
            renderDetail={renderExperimentDetail}
            onDelete={(item) => setDeletedIds((s) => new Set([...s, item.id]))}
            onBulkDelete={(ids) => setDeletedIds((s) => new Set([...s, ...ids]))}
            onExport={(items) => {
              const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = "experiments.json"
              a.click()
            }}
          />
          <p className="text-[10px] text-muted-foreground">Select rows with checkboxes for bulk actions. Click the eye icon to open the detail panel.</p>
        </section>

        <Separator />

        {/* DetailPanel */}
        <section className="space-y-3">
          <SectionTitle>DetailPanel — sticky two-column layout</SectionTitle>
          <ImportLine>{'import { DetailPanel } from "@workspace/data/components/detail-panel"'}</ImportLine>
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-3">Click an item to see its detail:</p>
                <div className="divide-y divide-border">
                  {SAMPLE_EXPERIMENTS.slice(0, 4).map((exp) => (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => setSelectedItem(exp)}
                      className={`flex w-full items-center gap-3 py-2 px-1 text-left text-xs transition-colors hover:bg-muted rounded ${
                        selectedItem?.id === exp.id ? "bg-muted" : ""
                      }`}
                    >
                      <StatusDot
                        status={exp.status === "running" ? "active" : exp.status === "failed" ? "danger" : "muted"}
                        size="sm"
                      />
                      <span className="font-medium flex-1">{exp.name}</span>
                      <span className="font-mono text-muted-foreground">{exp.samples.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            {selectedItem ? (
              <DetailPanel.Root>
                <DetailPanel.Header>
                  <h3 className="text-sm font-medium">{selectedItem.name}</h3>
                  <p className="text-[10px] font-mono text-muted-foreground">{selectedItem.id}</p>
                </DetailPanel.Header>
                <DetailPanel.Section title="Metrics">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Arms</span>
                      <span className="font-mono">{selectedItem.arms}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Samples</span>
                      <span className="font-mono">{selectedItem.samples.toLocaleString()}</span>
                    </div>
                  </div>
                </DetailPanel.Section>
                <DetailPanel.Section title="Health">
                  <Meter
                    value={selectedItem.samples}
                    max={70000}
                    color={selectedItem.status === "failed" ? "danger" : "primary"}
                    size="md"
                  />
                </DetailPanel.Section>
              </DetailPanel.Root>
            ) : (
              <DetailPanel.Empty />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{children}</h2>
}

function ImportLine({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-mono text-muted-foreground/50 bg-muted/30 px-2 py-1 rounded">
      {children}
    </div>
  )
}
