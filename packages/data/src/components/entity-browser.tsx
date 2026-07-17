import { useState, useCallback, type ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { Trash2Icon, DownloadIcon, UploadIcon, XIcon } from "lucide-react"
import { EntityTable, type Column } from "@workspace/data/components/entity-table"
import { DetailPanel } from "@workspace/data/components/detail-panel"

/**
 * Polymorphic CRUD browser — table + selection + bulk actions + detail view.
 *
 * Works with any entity type via generics. The caller provides:
 *   - columns: what to show in the table
 *   - data: the entities to display
 *   - renderDetail: how to render the selected entity's detail view
 *   - onDelete/onBulkDelete: delete callbacks
 *   - onExport/onImport: optional import/export handlers
 *
 * Usage:
 *   <EntityBrowser
 *     data={experiments}
 *     columns={[
 *       { key: "name", label: "Name" },
 *       { key: "status", label: "Status", render: (v) => <Badge>{v}</Badge> },
 *     ]}
 *     renderDetail={(item) => <ExperimentDetail item={item} />}
 *     onDelete={(item) => deleteMutation.mutate(item.id)}
 *     onBulkDelete={(ids) => bulkDeleteMutation.mutate(ids)}
 *   />
 */

export interface EntityBrowserProps<T extends { id: string }> {
  data: T[]
  columns: Column<T>[]
  /** Render the detail view for a selected entity */
  renderDetail?: (item: T) => ReactNode
  /** Delete a single entity */
  onDelete?: (item: T) => void
  /** Delete multiple entities by ID */
  onBulkDelete?: (ids: string[]) => void
  /** Export handler — called with selected items (or all if none selected) */
  onExport?: (items: T[]) => void
  /** Import handler — called when user uploads data */
  onImport?: (data: string) => void
  /** Empty state message */
  emptyMessage?: string
  /** Title shown above the table */
  title?: string
  className?: string
}

export function EntityBrowser<T extends { id: string }>({
  data,
  columns,
  renderDetail,
  onDelete,
  onBulkDelete,
  onExport,
  onImport,
  emptyMessage = "No items found",
  title,
  className,
}: EntityBrowserProps<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewingItem, setViewingItem] = useState<T | null>(null)

  const hasSelection = selectedIds.size > 0

  const handleView = useCallback(
    (item: T) => setViewingItem(item),
    [],
  )

  const handleDelete = useCallback(
    (item: T) => {
      onDelete?.(item)
      if (viewingItem?.id === item.id) setViewingItem(null)
    },
    [onDelete, viewingItem],
  )

  const handleBulkDelete = useCallback(() => {
    if (!onBulkDelete || selectedIds.size === 0) return
    onBulkDelete(Array.from(selectedIds))
    setSelectedIds(new Set())
    if (viewingItem && selectedIds.has(viewingItem.id)) setViewingItem(null)
  }, [onBulkDelete, selectedIds, viewingItem])

  const handleExport = useCallback(() => {
    if (!onExport) return
    const items = hasSelection
      ? data.filter((d) => selectedIds.has(d.id))
      : data
    onExport(items)
  }, [onExport, data, selectedIds, hasSelection])

  const handleImport = useCallback(() => {
    if (!onImport) return
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      onImport(text)
    }
    input.click()
  }, [onImport])

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header bar — selection state replaces the title/count in place so
          selecting rows never shifts the table below it. */}
      <div className="flex h-7 items-center justify-between">
        {hasSelection ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} selected
            </span>
            {onBulkDelete && (
              <Button variant="ghost" size="xs" onClick={handleBulkDelete} className="text-destructive">
                <Trash2Icon className="size-3 mr-1" />
                Delete
              </Button>
            )}
            <Button variant="ghost" size="icon-xs" onClick={() => setSelectedIds(new Set())} title="Clear selection">
              <XIcon className="size-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {title && <h2 className="text-sm font-medium">{title}</h2>}
            <Badge variant="secondary" className="font-mono text-[10px]">
              {data.length}
            </Badge>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {onImport && (
            <Button variant="ghost" size="icon-xs" onClick={handleImport} title="Import JSON">
              <UploadIcon className="size-3.5" />
            </Button>
          )}
          {onExport && (
            <Button variant="ghost" size="icon-xs" onClick={handleExport} title={hasSelection ? "Export selected" : "Export all"}>
              <DownloadIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Two-column layout: table + optional detail */}
      <div className={cn("grid gap-4", renderDetail && viewingItem ? "lg:grid-cols-[1fr_360px]" : "")}>
        <EntityTable
          columns={columns}
          data={data}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onView={renderDetail ? handleView : undefined}
          onDelete={onDelete ? handleDelete : undefined}
          emptyMessage={emptyMessage}
        />

        {renderDetail && viewingItem && (
          <DetailPanel.Root className="space-y-3">
            <DetailPanel.Header className="flex items-center justify-between space-y-0">
              <span className="text-xs font-mono text-muted-foreground">Detail</span>
              <Button variant="ghost" size="icon-xs" onClick={() => setViewingItem(null)}>
                <XIcon className="size-3" />
              </Button>
            </DetailPanel.Header>
            <Separator />
            {renderDetail(viewingItem)}
          </DetailPanel.Root>
        )}
      </div>
    </div>
  )
}
