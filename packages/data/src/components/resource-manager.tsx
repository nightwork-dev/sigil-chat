import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { CircleAlertIcon } from "lucide-react"
import { EntityTable, type Column } from "@workspace/data/components/entity-table"
import { DetailPanel } from "@workspace/data/components/detail-panel"

/**
 * ResourceManager — generic list-selects-detail shell.
 *
 * A Root/Parts compound component wrapping the existing `EntityTable` /
 * `DetailPanel` primitives with selection state and a consistent
 * toolbar/list/detail grid. It owns nothing about *what* is being managed —
 * agents, skills, tools, or any other domain object with an `id` — the
 * caller supplies items (already fetched via its own React Query hook),
 * columns/renderRow for the list, and a Detail body that reads the current
 * selection via `useResourceManager()`.
 *
 * Data fetching/mutation stays entirely in the caller. Root owns only
 * selection state (`selectedId`) — no `useEffect`, no derived-state sync.
 *
 * Usage:
 *   <ResourceManager.Root
 *     items={agents.data ?? []}
 *     isLoading={agents.isPending}
 *     isError={agents.isError}
 *     error={agents.error as Error | null}
 *   >
 *     <ResourceManager.Toolbar>
 *       <SearchInput ... />
 *     </ResourceManager.Toolbar>
 *     <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
 *       <ResourceManager.List columns={agentColumns} renderRow={(agent) => <AgentRow agent={agent} />} />
 *       <ResourceManager.Detail empty={<ResourceManager.EmptyDetail>Select an agent</ResourceManager.EmptyDetail>}>
 *         <AgentDetail />
 *       </ResourceManager.Detail>
 *     </div>
 *   </ResourceManager.Root>
 */

interface ResourceManagerContextValue<T extends { id: string }> {
  items: T[]
  selectedId: string | null
  select: (id: string | null) => void
  isLoading: boolean
  isError: boolean
  error: Error | null
}

// Compound generic components can't carry their type parameter through a
// module-level Context — this is the standard escape hatch. `useResourceManager<T>()`
// re-asserts the real item type at each call site.
const ResourceManagerContext =
  createContext<ResourceManagerContextValue<{ id: string }> | null>(null)

export function useResourceManager<T extends { id: string }>() {
  const ctx = useContext(ResourceManagerContext)
  if (!ctx) {
    throw new Error(
      "ResourceManager parts must be used inside <ResourceManager.Root>",
    )
  }
  return ctx as unknown as ResourceManagerContextValue<T>
}

function Root<T extends { id: string }>({
  items,
  isLoading,
  isError,
  error,
  children,
  className,
}: {
  items: T[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  children: ReactNode
  className?: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const select = useCallback((id: string | null) => setSelectedId(id), [])

  return (
    <ResourceManagerContext.Provider
      value={{
        items: items as unknown as { id: string }[],
        selectedId,
        select,
        isLoading,
        isError,
        error,
      }}
    >
      <div
        data-slot="resource-manager"
        className={cn("grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]", className)}
      >
        {children}
      </div>
    </ResourceManagerContext.Provider>
  )
}

function Toolbar({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const { items } = useResourceManager()

  return (
    <div
      data-slot="resource-manager-toolbar"
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
        {items.length}
      </Badge>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

function List<T extends { id: string }>({
  columns,
  emptyMessage,
  renderRow,
  className,
}: {
  columns: Column<T>[]
  emptyMessage?: string
  renderRow?: (item: T) => ReactNode
  className?: string
}) {
  const { items, selectedId, select, isLoading, isError, error } =
    useResourceManager<T>()

  if (isLoading) return <ListSkeleton />

  if (isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Could not load</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Unknown error"}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (renderRow) {
    if (items.length === 0) {
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {emptyMessage ?? "No items found"}
        </div>
      )
    }

    return (
      <div
        data-slot="resource-manager-list"
        role="list"
        className={cn("min-h-0 overflow-y-auto", className)}
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="listitem"
            aria-selected={item.id === selectedId}
            data-selected={item.id === selectedId ? "" : undefined}
            onClick={() => select(item.id)}
            className={cn(
              "cursor-pointer border-b border-border last:border-b-0",
              item.id === selectedId && "bg-accent",
            )}
          >
            {renderRow(item)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <EntityTable
      columns={columns}
      data={items}
      onView={(row) => select(row.id)}
      emptyMessage={emptyMessage}
      className={cn("min-h-0 overflow-y-auto", className)}
    />
  )
}

function Detail({
  children,
  empty,
  className,
}: {
  children?: ReactNode
  empty?: ReactNode
  className?: string
}) {
  const { selectedId } = useResourceManager()

  if (selectedId === null) return <>{empty}</>

  return (
    <DetailPanel.Root className={className}>{children}</DetailPanel.Root>
  )
}

function EmptyDetail({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <DetailPanel.Empty className={className}>{children}</DetailPanel.Empty>
}

export const ResourceManager = {
  Root,
  Toolbar,
  List,
  Detail,
  EmptyDetail,
}
