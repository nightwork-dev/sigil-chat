// The scaffolding every settings tab shares: the reading-width column, the
// bordered section block, and the three notes a section shows instead of its
// content (loading, unavailable, nothing here yet).
//
// Extracted because each tab had rebuilt them by hand, so the same block
// carried slightly different classes in different tabs and a new tab had to
// guess which copy was current. Nothing here decides anything — it is layout
// and the one type scale those notes are written at.

import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

const PANEL_WIDTH = {
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
} as const

/** One settings tab's column. Width follows the widest content it holds. */
export function SettingsPanel({
  width = "2xl",
  className,
  children,
}: {
  width?: keyof typeof PANEL_WIDTH
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn("flex flex-col gap-6 p-4", PANEL_WIDTH[width], className)}
    >
      {children}
    </div>
  )
}

/**
 * One bordered block inside a panel.
 *
 * `stack` is the default: a heading over its controls. `row` is the single
 * setting whose control sits opposite its label.
 */
export function SettingsSection({
  layout = "stack",
  className,
  children,
}: {
  layout?: "stack" | "row"
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border p-3",
        layout === "row"
          ? "flex items-center justify-between gap-4"
          : "flex flex-col gap-3",
        className,
      )}
    >
      {children}
    </section>
  )
}

/** A supporting line inside a section. `error` states what is not available. */
export function SettingsNote({
  tone = "muted",
  className,
  children,
}: {
  tone?: "muted" | "error"
  className?: string
  children: ReactNode
}) {
  return (
    <p
      className={cn(
        "text-xs",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  )
}

/**
 * A section's content once its query has settled, or the note that stands in
 * for it.
 *
 * `isEmpty` is the caller's own question — "settled, but there is nothing to
 * show" is domain-specific, and only the caller knows which field answers it.
 */
export function SettingsAsyncState({
  query,
  pending,
  error,
  isEmpty = false,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean }
  pending: ReactNode
  error: ReactNode
  isEmpty?: boolean
  empty?: ReactNode
  children: ReactNode
}) {
  if (query.isPending) return <SettingsNote>{pending}</SettingsNote>
  if (query.isError) return <SettingsNote tone="error">{error}</SettingsNote>
  if (isEmpty) return <SettingsNote>{empty}</SettingsNote>
  return <>{children}</>
}
