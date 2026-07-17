"use client"

// Drag-to-reorder added 2026-06-30
// (@dnd-kit sortable + flatten/rebuild-tree algorithm) — the file-type
// icon variety, file-size formatting, and framer-motion entrance
// animations were file-browser-specific, not generic-tree concerns, so
// weren't carried over. Note: the source's roadmap entry mentioned
// "rename" but no such feature actually exists in that file — only
// drag-to-reorder. Kept TreeView fully CONTROLLED (nodes + onReorder,
// not internally-owned state) matching every other port this session
// (RangeSlider/VectorEditor/BezierEditor convention) —
// the source's FileTree owned its own `items` state internally instead.
// Reordering activates only when `onReorder` is passed — existing
// non-reordering consumers are unaffected. @dnd-kit/core's DndContext
// generates its a11y "DndDescribedBy-N" id from a module-level counter,
// which can disagree between SSR and hydration the same way recharts'
// clip-path ids do (see apps/web/.../dashboard.tsx, which uses TanStack
// Router's <ClientOnly> for the same reason) — this package can't import
// the router (packages/ui stays router-agnostic), so the same "render
// nothing extra until mounted" gate is done locally via useHasMounted
// instead: SSR and the first client render both produce the plain,
// non-draggable rows (identical output, no mismatch); the DndContext
// wrapper mounts only after that first client render commits. Unlike
// animated-patterns.tsx's random geometry, this one genuinely can't be
// fixed by seeding — the counter lives inside @dnd-kit itself.

import { useCallback, useMemo, useState } from "react"
import { useHasMounted } from "@workspace/ui/hooks/use-has-mounted"
import { ChevronRight, File, Folder, GripVertical } from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@workspace/ui/lib/utils"

export interface TreeNode {
  id: string
  label: string
  icon?: string // lucide icon name hint -- component uses Folder/File defaults
  children?: TreeNode[]
  isExpanded?: boolean
}

export interface TreeViewProps {
  nodes: TreeNode[]
  selection?: string | null
  onSelect?: (id: string) => void
  onToggle?: (id: string) => void
  /** Presence enables drag-to-reorder (dnd-kit sortable, restricted to the vertical axis). */
  onReorder?: (nodes: TreeNode[]) => void
  indentWidth?: number
  className?: string
}

interface FlatEntry {
  node: TreeNode
  depth: number
}

function flatten(nodes: TreeNode[], depth = 0): FlatEntry[] {
  const result: FlatEntry[] = []
  for (const node of nodes) {
    result.push({ node, depth })
    if (node.children?.length && node.isExpanded) result.push(...flatten(node.children, depth + 1))
  }
  return result
}

/** Rebuilds the nested tree from a reordered flat list, using each entry's depth to re-derive parenting. */
function rebuildTree(flat: FlatEntry[]): TreeNode[] {
  const result: TreeNode[] = []
  const stack: { node: TreeNode; depth: number }[] = []

  for (const entry of flat) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= entry.depth) stack.pop()

    // A collapsed container's children were never part of the flattened
    // (reorderable) set — flatten() only descends into isExpanded nodes —
    // so they must stay untouched, not dropped, and not re-derived from a
    // traversal that never visited them. Only an EXPANDED container gets a
    // fresh `children: []` to be repopulated purely from what this flat
    // traversal actually visits next at depth+1; without this reset, the
    // shallow `{...entry.node}` copy keeps the OLD children array and the
    // loop below appends newly-flattened children on top of it, duplicating
    // every node in the subtree.
    const isExpandedContainer = entry.node.children !== undefined && !!entry.node.isExpanded
    const node: TreeNode = { ...entry.node, children: isExpandedContainer ? [] : entry.node.children }

    if (stack.length === 0) {
      result.push(node)
    } else {
      const parent = stack[stack.length - 1].node
      parent.children = [...(parent.children ?? []), node]
    }

    if (isExpandedContainer) stack.push({ node, depth: entry.depth })
  }

  return result
}

function TreeView({ nodes, selection = null, onSelect, onToggle, onReorder, indentWidth = 16, className }: TreeViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // SSR and the first client render must produce identical output — this
  // flips true only after that first render commits, so DndContext (whose
  // internal id counter can disagree between server and client) never
  // renders during the render that has to match the server.
  const dragEnabled = useHasMounted()
  const flat = useMemo(() => flatten(nodes), [nodes])
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = flat.findIndex((e) => e.node.id === active.id)
      const newIndex = flat.findIndex((e) => e.node.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      onReorder?.(rebuildTree(arrayMove(flat, oldIndex, newIndex)))
    },
    [flat, onReorder]
  )

  const rows = (
    <div data-slot="tree-view" role="tree" className={cn("overflow-y-auto rounded-md border border-border bg-white/[0.02]", className)}>
      <div className="py-1">
        {flat.map(({ node, depth }) => (
          <TreeNodeRow
            key={node.id}
            node={node}
            depth={depth}
            selection={selection}
            onSelect={onSelect}
            onToggle={onToggle}
            indentWidth={indentWidth}
            sortable={!!onReorder && dragEnabled}
            isDragging={draggingId === node.id}
          />
        ))}
      </div>
    </div>
  )

  if (!onReorder || !dragEnabled) return rows

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragStart={(e) => setDraggingId(String(e.active.id))} onDragEnd={handleDragEnd}>
      <SortableContext items={flat.map((e) => e.node.id)} strategy={verticalListSortingStrategy}>
        {rows}
      </SortableContext>
    </DndContext>
  )
}

interface TreeNodeRowProps {
  node: TreeNode
  selection: string | null
  onSelect?: (id: string) => void
  onToggle?: (id: string) => void
  depth: number
  indentWidth: number
  sortable: boolean
  isDragging: boolean
}

function TreeNodeRow({ node, selection, onSelect, onToggle, depth, indentWidth, sortable, isDragging }: TreeNodeRowProps) {
  const isLeaf = !node.children || node.children.length === 0
  const isSelected = selection === node.id
  const isExpanded = node.isExpanded ?? false

  // useSortable is a hook — must be called unconditionally. When `sortable`
  // is false its ref/listeners are simply never attached to the row below.
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: node.id })
  const style = sortable ? { transform: CSS.Transform.toString(transform), transition } : undefined

  return (
    <div ref={sortable ? setNodeRef : undefined} style={style}>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={isLeaf ? undefined : isExpanded}
        aria-level={depth + 1}
        tabIndex={0}
        className={cn(
          "group flex items-center gap-1 px-1.5 py-0.5 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          isSelected ? "bg-primary/10" : "hover:bg-white/[0.03]",
          isDragging && "opacity-50"
        )}
        onClick={() => onSelect?.(node.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect?.(node.id)
          } else if (!isLeaf && e.key === "ArrowRight" && !isExpanded) {
            e.preventDefault()
            onToggle?.(node.id)
          } else if (!isLeaf && e.key === "ArrowLeft" && isExpanded) {
            e.preventDefault()
            onToggle?.(node.id)
          }
        }}
      >
        {sortable && (
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 flex size-3 items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={`Reorder ${node.label}`}
          >
            <GripVertical className="size-2.5" />
          </button>
        )}

        {Array.from({ length: depth }, (_, d) => (
          <div key={d} className="shrink-0 flex justify-center" style={{ width: indentWidth }}>
            <div className="w-px h-full bg-border/20" style={{ minHeight: 16 }} />
          </div>
        ))}

        {!isLeaf ? (
          <button
            className="shrink-0 flex items-center justify-center w-3 h-3 text-muted-foreground hover:text-foreground transition-transform"
            onClick={(e) => {
              e.stopPropagation()
              onToggle?.(node.id)
            }}
          >
            <ChevronRight className={cn("h-[7px] w-[7px] transition-transform duration-150", isExpanded && "rotate-90")} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="shrink-0 w-3" />
        )}

        <div className="shrink-0 w-3.5 flex items-center justify-center">
          {isLeaf ? (
            <File className={cn("h-[9px] w-[9px]", isSelected ? "text-primary" : "text-muted-foreground")} strokeWidth={2} />
          ) : (
            <Folder className={cn("h-[9px] w-[9px]", isSelected ? "text-primary" : "text-muted-foreground")} strokeWidth={2} />
          )}
        </div>

        <span className={cn("font-mono text-[10px] truncate leading-none", isSelected ? "text-primary font-semibold" : "text-foreground")}>{node.label}</span>
      </div>
    </div>
  )
}

export { TreeView }
