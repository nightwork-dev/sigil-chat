// Atom: DropZone — a droppable target.
//
// Wraps `useDroppable` for free-form DnD. Pair with <Draggable> when you need
// "drop X onto Y" without list ordering. For reorderable lists use `SortableList`
// (each item is implicitly a drop target); for kanban use `KanbanBoard`.

import { useDroppable } from "@dnd-kit/core"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type DroppableHookReturn = ReturnType<typeof useDroppable>

export interface DropZoneData {
  [key: string]: unknown
}

export interface DropZoneRenderProps {
  /** Ref for the measured container. */
  setNodeRef: DroppableHookReturn["setNodeRef"]
  isOver: boolean
}

export interface DropZoneProps {
  id: string
  data?: DropZoneData
  disabled?: boolean
  className?: string
  /** Highlight the zone while a draggable is over it. Default true. */
  highlightOnOver?: boolean
  children: ReactNode | ((props: DropZoneRenderProps) => ReactNode)
}

export function DropZone({
  id,
  data,
  disabled,
  className,
  highlightOnOver = true,
  children,
}: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled })
  if (typeof children === "function") {
    return <>{children({ setNodeRef, isOver })}</>
  }
  return (
    <div
      ref={setNodeRef}
      className={cn("transition-shadow", highlightOnOver && isOver && "ring-2 ring-primary/40", className)}
    >
      {children}
    </div>
  )
}
