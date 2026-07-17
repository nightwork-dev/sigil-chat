"use client"

// A node card for graph/diagram UIs — Tile is the full image-backed card
// (React Flow node, gallery tile), Compact is an inline badge-sized variant
// for lists or breadcrumbs. Both read the same node data via context, so a
// caller composes the same node differently per surface.

import { createContext, useContext, type ReactNode } from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@workspace/ui/lib/utils"

interface DiagramNodeContext {
  id: string
  label: string
  type: string
  image?: string
  description?: string
  selected?: boolean
}

const Ctx = createContext<DiagramNodeContext | null>(null)

function useDiagramNode() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("DiagramNode parts must be used inside <DiagramNode.Root>")
  return ctx
}

interface RootProps extends DiagramNodeContext {
  children: ReactNode
  className?: string
  render?: useRender.RenderProp
}

function Root({ children, className, render, ...value }: RootProps) {
  return (
    <Ctx.Provider value={value}>
      {useRender({
        defaultTagName: "div",
        props: mergeProps<"div">({ className, children }, {}),
        render,
        state: { slot: "diagram-node" },
      })}
    </Ctx.Provider>
  )
}

interface TileProps extends useRender.ComponentProps<"div"> {
  width?: number
  height?: number
  /** Drop border + shadow + background for bare-mode diagrams. */
  bare?: boolean
}

function Tile({ className, style, width = 200, height = 220, bare = false, render, ...props }: TileProps) {
  const { label, image, type, description, selected } = useDiagramNode()

  const content = image ? (
    <>
      <img src={image} alt={label} className="absolute inset-0 h-full w-full object-cover object-top" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 px-3 pb-2 pt-6">
        <div className="text-xs font-semibold leading-tight text-white drop-shadow">{label}</div>
        {description && <div className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-white/75">{description}</div>}
      </div>
      <div className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-white/80 backdrop-blur-sm">
        {type}
      </div>
    </>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center">
      <div className="text-xs font-semibold text-foreground">{label}</div>
      {description && <div className="line-clamp-3 text-[9px] leading-snug text-muted-foreground">{description}</div>}
      <div className="mt-auto text-[8px] uppercase tracking-wider text-muted-foreground/70">{type}</div>
    </div>
  )

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "group relative overflow-hidden rounded-lg transition-shadow",
          bare
            ? "border-0 bg-transparent shadow-none"
            : cn(
                "border bg-card shadow-sm",
                selected ? "border-foreground shadow-md ring-1 ring-foreground/20" : "border-border hover:shadow-md"
              ),
          className
        ),
        style: { width, height, ...style },
        children: content,
      },
      props
    ),
    render,
    state: { slot: "diagram-node-tile" },
  })
}

function Compact({ className, render, ...props }: useRender.ComponentProps<"div">) {
  const { label, type } = useDiagramNode()
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn("inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[10px]", className),
        children: (
          <>
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground">{type}</span>
          </>
        ),
      },
      props
    ),
    render,
    state: { slot: "diagram-node-compact" },
  })
}

export const DiagramNode = { Root, Tile, Compact }
