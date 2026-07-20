// Atom: Draggable — the lowest-level drag source.
//
// Wraps @dnd-kit/core's `useDraggable` so any element can become a drag source
// without buying into a list. Use this for free-form DnD (move A onto B). For
// list reordering use `SortableList`; for multi-column boards use `KanbanBoard`.
//
// Drag handle: spread `listeners` + `attributes` onto the element that should
// initiate the drag (a dedicated handle, or the whole card). `setNodeRef` goes
// on the measured container. The drag transform is applied via the provided
// `style` — spread it onto the same element as `setNodeRef`.

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type DraggableHookReturn = ReturnType<typeof useDraggable>

export interface DraggableData {
  [key: string]: unknown
}

export interface DraggableRenderProps {
  /** Ref for the measured container. */
  setNodeRef: DraggableHookReturn["setNodeRef"]
  /** Spread onto the drag handle element. */
  listeners: DraggableHookReturn["listeners"]
  attributes: DraggableHookReturn["attributes"]
  /** Spread onto the same element as `setNodeRef` — carries the transform. */
  style: CSSProperties
  isDragging: boolean
}

export interface DraggableProps {
  id: string
  data?: DraggableData
  disabled?: boolean
  className?: string
  /** Fade the source while dragging. Default true. */
  fadeWhileDragging?: boolean
  children: ReactNode | ((props: DraggableRenderProps) => ReactNode)
}

export function Draggable({
  id,
  data,
  disabled,
  className,
  fadeWhileDragging = true,
  children,
}: DraggableProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data,
    disabled,
  })
  const style: CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    opacity: isDragging && fadeWhileDragging ? 0.4 : undefined,
  }
  if (typeof children === "function") {
    return <>{children({ setNodeRef, listeners, attributes, style, isDragging })}</>
  }
  return (
    <div ref={setNodeRef} className={cn(className)} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

/**
 * Convenience root for simple free-form DnD (drop A into B). Wraps @dnd-kit's
 * DndContext with pointer sensors and a flat onDragEnd(activeId, overId), so
 * consumers compose `Draggable` + `DropZone` without importing @dnd-kit. For
 * lists use `SortableList`; for boards use `KanbanBoard`; for advanced needs
 * (drag overlays, live cross-zone movement, custom collision detection) reach
 * for @dnd-kit's DndContext directly.
 */
export interface DndAreaProps {
  children: ReactNode
  /** `overId` is null when the active was dropped outside any zone. */
  onDragEnd?: (activeId: string, overId: string | null) => void
}

export function DndArea({ children, onDragEnd }: DndAreaProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  return (
    <DndContext
      sensors={sensors}
      onDragEnd={(event) =>
        onDragEnd?.(String(event.active.id), event.over ? String(event.over.id) : null)
      }
    >
      {children}
    </DndContext>
  )
}
