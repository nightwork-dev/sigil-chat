import { cn } from "@workspace/ui/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Button } from "@workspace/ui/components/button"
import { EyeIcon, Trash2Icon } from "lucide-react"

/**
 * Generic table with column definitions, checkbox selection, and row actions.
 * Standalone — no React Query or routing dependency.
 *
 * The `T` generic preserves the row type through column renderers and callbacks.
 */

export interface Column<T> {
  key: keyof T & string
  label: string
  render?: (value: T[keyof T], row: T) => React.ReactNode
  className?: string
}

export interface EntityTableProps<T extends { id: string }> {
  columns: Column<T>[]
  data: T[]
  onView?: (row: T) => void
  onDelete?: (row: T) => void
  emptyMessage?: string
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
  className?: string
}

export function EntityTable<T extends { id: string }>({
  columns,
  data,
  onView,
  onDelete,
  emptyMessage = "No items found",
  selectedIds,
  onSelectionChange,
  className,
}: EntityTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className={cn("rounded-md border border-border p-8 text-center text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </div>
    )
  }

  const hasSelection = !!onSelectionChange
  const hasActions = !!onView || !!onDelete
  const allSelected = hasSelection && data.length > 0 && data.every((row) => selectedIds?.has(row.id))
  const someSelected = hasSelection && data.some((row) => selectedIds?.has(row.id))

  function toggleAll() {
    if (!onSelectionChange) return
    onSelectionChange(allSelected ? new Set() : new Set(data.map((row) => row.id)))
  }

  function toggleOne(id: string) {
    if (!onSelectionChange || !selectedIds) return
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <div className={cn("rounded-md border border-border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {hasSelection && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected }}
                  onChange={toggleAll}
                  className="size-3.5 rounded border-border accent-primary"
                  aria-label="Select all"
                />
              </TableHead>
            )}
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.label}
              </TableHead>
            ))}
            {hasActions && <TableHead className="w-20">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.id}>
              {hasSelection && (
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(row.id) ?? false}
                    onChange={() => toggleOne(row.id)}
                    className="size-3.5 rounded border-border accent-primary"
                    aria-label={`Select ${row.id}`}
                  />
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.render
                    ? col.render(row[col.key], row)
                    : String(row[col.key] ?? "")}
                </TableCell>
              ))}
              {hasActions && (
                <TableCell>
                  <div className="flex items-center gap-1">
                    {onView && (
                      <Button variant="ghost" size="icon-xs" onClick={() => onView(row)}>
                        <EyeIcon className="size-3.5" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button variant="ghost" size="icon-xs" onClick={() => onDelete(row)}>
                        <Trash2Icon className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
