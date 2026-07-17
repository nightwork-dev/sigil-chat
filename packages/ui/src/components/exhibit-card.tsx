"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { InstallSnippet } from "@workspace/ui/components/install-snippet"

interface ExhibitCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  controls?: React.ReactNode
  className?: string
  defaultExpanded?: boolean
  /** Registry item name (file basename) — shows a copyable install command in the header. */
  installName?: string
}

function ExhibitCard({
  title,
  subtitle,
  children,
  controls,
  className,
  defaultExpanded = false,
  installName,
}: ExhibitCardProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const hasControls = controls != null

  return (
    <div
      data-slot="exhibit-card"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10",
        className,
      )}
    >
      {/* Header row. The expand/collapse toggle is its own role="button" scoped
          to just the title/subtitle/chevron — NOT the whole row — so aria-disabled
          (when there are no controls to expand) doesn't roll up over the
          independently-clickable InstallSnippet button sitting beside it. */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <div
          role="button"
          aria-disabled={!hasControls}
          tabIndex={hasControls ? 0 : -1}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 outline-none",
            hasControls && "cursor-pointer",
            !hasControls && "cursor-default",
          )}
          onClick={() => hasControls && setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (!hasControls) return
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              setExpanded((v) => !v)
            }
          }}
        >
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-foreground">
            {title}
          </span>

          {subtitle && (
            <>
              <span className="text-[9px] text-muted-foreground">&middot;</span>
              <span className="font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {subtitle}
              </span>
            </>
          )}
        </div>

        {installName && <InstallSnippet name={installName} className="max-w-[45%]" />}

        {hasControls && (
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            className={cn(
              "shrink-0 cursor-pointer text-muted-foreground transition-transform duration-200 hover:text-foreground",
              expanded && "rotate-90",
            )}
            onClick={() => setExpanded((v) => !v)}
          >
            <path
              d="M2.5 1L5.5 4L2.5 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Preview (always visible) */}
      <div className="px-3 pb-3">{children}</div>

      {/* Controls (collapsible) */}
      {hasControls && expanded && (
        <div className="border-t border-border">
          <div className="flex flex-col gap-2.5 px-3 py-3">{controls}</div>
        </div>
      )}
    </div>
  )
}

export { ExhibitCard }
export type { ExhibitCardProps }
