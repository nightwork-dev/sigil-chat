// Molecule: SortableList + SortableItem — reorderable lists.
//
// `SortableList` owns its own DndContext + SortableContext, so it's drop-in for
// "drag to reorder these items." `SortableItem` is the per-item wrapper around
// `useSortable`; it's exported because multi-container compositions (like
// `KanbanBoard`) need to share ONE DndContext across several SortableContexts
// and therefore compose their own rather than reuse `SortableList`.
//
// Handle-based dragging: spread `listeners` + `attributes` onto a dedicated
// handle element (and use `setActivatorNodeRef`), so buttons/links inside the
// card stay clickable. Put `setNodeRef` + `style` on the measured card.

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type SortableHookReturn = ReturnType<typeof useSortable>

export interface SortableItemData {
  [key: string]: unknown
}

export interface SortableItemRenderProps {
  /** Ref for the measured item container. */
  setNodeRef: SortableHookReturn["setNodeRef"]
  /** Ref for a dedicated drag handle (optional — otherwise drag from anywhere). */
  setActivatorNodeRef: SortableHookReturn["setActivatorNodeRef"]
  /** Spread onto the drag handle element. */
  listeners: SortableHookReturn["listeners"]
  attributes: SortableHookReturn["attributes"]
  /** Spread onto the same element as `setNodeRef` — carries the transform. */
  style: CSSProperties
  isDragging: boolean
}

export interface SortableItemProps {
  id: string
  data?: SortableItemData
  disabled?: boolean
  /** Render-prop: compose your own item element. */
  children: (props: SortableItemRenderProps) => ReactNode
}

/** A single reorderable item. Composes under an ancestor DndContext. */
export function SortableItem({ id, data, disabled, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, data, disabled })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }
  return (
    <>
      {children({ setNodeRef, setActivatorNodeRef, listeners, attributes, style, isDragging })}
    </>
  )
}

export type SortableStrategy = "vertical" | "horizontal"

export interface SortableListProps<T> {
  items: T[]
  getId: (item: T) => string
  onReorder: (next: T[]) => void
  strategy?: SortableStrategy
  className?: string
  /** Render-prop: compose each item. */
  renderItem: (item: T, props: SortableItemRenderProps) => ReactNode
}

/** A self-contained reorderable list. Owns its DndContext (single container). */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  strategy = "vertical",
  className,
  renderItem,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const strategyFn =
    strategy === "vertical" ? verticalListSortingStrategy : horizontalListSortingStrategy
  const ids = items.map(getId)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={strategyFn}>
        <div className={cn(strategy === "vertical" ? "space-y-2" : "flex gap-2", className)}>
          {items.map((item) => (
            <SortableItem key={getId(item)} id={getId(item)}>
              {(props) => renderItem(item, props)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
