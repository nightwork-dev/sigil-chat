// The two things every settings tab shares that packages/ui does not already
// answer: how wide a tab's reading column is, and what a section shows while
// its query is still settling.
//
// The bordered block itself is no longer minted here — that is Card, and a
// section is now Card with the settings page's padding. Supporting and error
// lines are FieldDescription and FieldError. Both were hand-rolled in an
// earlier pass; this file only keeps what is genuinely this page's own.

import type { ReactNode } from "react"

import { Card } from "@workspace/ui/components/card"
import { FieldDescription, FieldError } from "@workspace/ui/components/field"
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
 * One block inside a panel — a Card at the settings page's density.
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
    <Card
      size="sm"
      className={cn(
        "px-3",
        layout === "row" && "flex-row items-center justify-between gap-4",
        className,
      )}
    >
      {children}
    </Card>
  )
}

/**
 * A section's content once its query has settled, or the line that stands in
 * for it.
 *
 * The choice being made here is this page's, not a general one: a settings
 * section that is still loading shows one quiet line rather than a spinner or
 * a skeleton, because a tab full of shimmering blocks reads as broken.
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
  if (query.isPending) return <FieldDescription>{pending}</FieldDescription>
  if (query.isError) return <FieldError>{error}</FieldError>
  if (isEmpty) return <FieldDescription>{empty}</FieldDescription>
  return <>{children}</>
}
