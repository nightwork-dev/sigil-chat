// Block: KanbanBoard — a generic multi-column board with cross-column drag-and-drop.
//
// Extracted from sigil-chat's roadmap workspace (RoadmapWorkspace → BoardColumn →
// BoardCard), generalized over item type T so any domain data can drive it. The
// roadmap carries it back as owned source, supplying its Story items + an onMove
// that fires the status transition.
//
// Owns ONE DndContext across all columns (required for cross-column moves). Each
// column is a SortableContext (within-column reorder) wrapped in a droppable
// container (so empty columns still accept drops). Cards carry their column id in
// sortable data, so a single onDragEnd resolves source column, target column, and
// the final index. A DragOverlay lifts the card out of the column's overflow clip
// so it follows the cursor cleanly across columns.
//
// Controlled: the board never mutates its props. It calls onMove with the desired
// final position; the consumer reconciles its data and re-passes updated
// columnItems.

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { type ReactNode, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"
import {
  SortableItem,
  type SortableItemRenderProps,
} from "@workspace/ui/components/dnd/sortable"

export interface KanbanColumn {
  id: string
  title?: ReactNode
}

export interface KanbanBoardProps<T> {
  columns: KanbanColumn[]
  /** item id → item. */
  items: Record<string, T>
  /** column id → ordered item ids in that column. */
  columnItems: Record<string, string[]>
  /**
   * Fires with the resolved move. `newIndex` is the FINAL desired position of
   * `activeId` in `toColumnId` — the board already accounts for the in-column
   * removal, so the consumer can remove-then-insert without index math.
   *
   * ID invariant: @dnd-kit uses one global id namespace per DndContext, so card
   * ids and column ids must not collide within a single board (a card whose id
   * equals a column id would make `over.id` ambiguous). Keep them disjoint.
   */
  onMove: (activeId: string, fromColumnId: string, toColumnId: string, newIndex: number) => void
  /** Render a card. Spread `drag` onto the card's outer element. */
  renderCard: (item: T, drag: SortableItemRenderProps) => ReactNode
  renderColumnHeader?: (column: KanbanColumn, count: number) => ReactNode
  /** Custom drag preview. Defaults to re-rendering the card. */
  renderOverlay?: (activeId: string, item: T) => ReactNode
  className?: string
  columnClassName?: string
}

/**
 * Pure move resolution extracted from handleDragEnd so the index math is
 * exhaustively testable without rendering React. Returns null for a no-op
 * (dropped outside, dropped back on the same spot, or missing column data).
 *
 * `newIndex` is the FINAL desired position of the dragged card in `toColumnId`,
 * computed against the target list AFTER removing the dragged card (same-column
 * case), so the consumer can remove-then-insert without offset math.
 */
export interface ResolvedBoardMove {
  activeId: string
  fromColumnId: string
  toColumnId: string
  newIndex: number
}

export function resolveBoardMove(
  drop: {
    activeId: string
    fromColumnId: string | undefined
    overId: string | null
    /** "column" when dropped on a column body; anything else (or null) = a card. */
    overType: string | null
    /** The columnId carried by `over` when it's a card; undefined for a column body. */
    overColumnId: string | undefined
  },
  columnItems: Record<string, string[]>,
): ResolvedBoardMove | null {
  if (!drop.overId) return null
  if (!drop.fromColumnId) return null
  const overIsColumn = drop.overType === "column"
  const toColumnId = overIsColumn ? drop.overId : drop.overColumnId
  if (!toColumnId) return null

  const draggedId = drop.activeId
  const fromColumnId = drop.fromColumnId
  const targetRaw = columnItems[toColumnId] ?? []
  const sourceRaw = columnItems[fromColumnId] ?? []
  const sameColumn = fromColumnId === toColumnId
  // For same-column moves, index against the list WITHOUT the dragged card so
  // `newIndex` is the post-removal insertion point (no offset math for the
  // consumer).
  const targetList = sameColumn ? targetRaw.filter((id) => id !== draggedId) : targetRaw
  const originalIndex = sameColumn ? sourceRaw.indexOf(draggedId) : -1
  let newIndex: number
  if (overIsColumn) {
    newIndex = targetList.length
  } else if (drop.overId === draggedId) {
    // Dropped back onto itself — would re-insert at its original slot. Map to
    // the pre-removal index so the no-op guard below fires.
    newIndex = originalIndex
  } else {
    const hit = targetList.indexOf(drop.overId)
    newIndex = hit === -1 ? targetList.length : hit
  }
  // Direction-aware adjustment for same-column moves: when a card is dragged
  // DOWNWARD onto a later card, it should land AFTER that card (not before).
  // The raw `hit` is "insert before the hovered card," which is correct for
  // upward moves but off-by-one for downward moves. Compare the dragged
  // card's original position to the hovered card's to decide before/after.
  // (Cross-column moves keep `hit` — there's no "original position" to
  // compare against in the target column.)
  if (sameColumn && !overIsColumn && drop.overId !== draggedId) {
    const overOriginal = sourceRaw.indexOf(drop.overId)
    if (
      overOriginal !== -1 &&
      originalIndex < overOriginal &&
      newIndex === targetList.indexOf(drop.overId)
    ) {
      newIndex += 1
    }
  }
  // Same-column no-op: the card would land exactly where it started.
  if (sameColumn && newIndex === originalIndex) return null
  return { activeId: draggedId, fromColumnId, toColumnId, newIndex }
}

export function KanbanBoard<T>({
  columns,
  items,
  columnItems,
  onMove,
  renderCard,
  renderColumnHeader,
  renderOverlay,
  className,
  columnClassName,
}: KanbanBoardProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [activeId, setActiveId] = useState<string | null>(null)

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const move = resolveBoardMove(
      {
        activeId: String(event.active.id),
        fromColumnId: event.active.data.current?.columnId as string | undefined,
        overId: event.over ? String(event.over.id) : null,
        overType: (event.over?.data.current?.type as string | undefined) ?? null,
        overColumnId: event.over?.data.current?.columnId as string | undefined,
      },
      columnItems,
    )
    if (move) onMove(move.activeId, move.fromColumnId, move.toColumnId, move.newIndex)
  }

  const activeItem = activeId ? items[activeId] : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className={cn("flex gap-3", className)}>
        {columns.map((column) => {
          const ids = columnItems[column.id] ?? []
          return (
            <KanbanColumnView
              key={column.id}
              column={column}
              ids={ids}
              columnClassName={columnClassName}
              renderColumnHeader={renderColumnHeader}
            >
              {ids.map((itemId) => {
                const item = items[itemId]
                if (!item) return null
                return (
                  <SortableItem
                    key={itemId}
                    id={itemId}
                    data={{ type: "card", columnId: column.id }}
                  >
                    {(drag) => renderCard(item, drag)}
                  </SortableItem>
                )
              })}
            </KanbanColumnView>
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeId && activeItem
          ? renderOverlay
            ? renderOverlay(activeId, activeItem)
            : renderCard(activeItem, NEUTRAL_DRAG)
          : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumnView({
  column,
  ids,
  columnClassName,
  renderColumnHeader,
  children,
}: {
  column: KanbanColumn
  ids: string[]
  columnClassName?: string
  renderColumnHeader?: (column: KanbanColumn, count: number) => ReactNode
  children: ReactNode
}) {
  // The column body is a droppable of type "column" so empty columns accept drops
  // and onDragEnd can tell "dropped onto the column itself" from "onto a card."
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: "column" } })
  return (
    <div className={cn("flex w-72 shrink-0 flex-col", columnClassName)}>
      <div className="flex items-center justify-between px-2 pb-2">
        {renderColumnHeader ? (
          renderColumnHeader(column, ids.length)
        ) : (
          <span className="text-xs font-medium">{column.title}</span>
        )}
        <span className="font-mono text-[0.625rem] text-muted-foreground">{ids.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "scroll-area min-h-[4rem] flex-1 space-y-2 overflow-y-auto rounded-md p-2 transition-colors",
            isOver && "bg-muted/40",
          )}
        >
          {ids.length === 0 ? (
            <p className="px-1 text-[0.625rem] text-muted-foreground/70">Empty</p>
          ) : (
            children
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// Stub render-props for the default DragOverlay. The preview is not a real
// sortable — it just needs the spread shape consumers expect from renderCard.
// setNodeRef is a no-op (the DragOverlay positions the preview itself) and the
// attributes mark it inert (the overlay is transient, no keyboard interaction).
const NEUTRAL_DRAG: SortableItemRenderProps = {
  setNodeRef: () => {},
  setActivatorNodeRef: () => {},
  listeners: undefined,
  attributes: {
    role: "button",
    tabIndex: -1,
    "aria-disabled": true,
    "aria-pressed": undefined,
    "aria-roledescription": "draggable",
    "aria-describedby": "",
  },
  style: {},
  isDragging: true,
}
