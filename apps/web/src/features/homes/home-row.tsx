// HomeRow — one record in a home section list, plus the quiet ownership
// chip. Rows are links by default; RESTRICTED rows are inert: no href, no
// id, no name, removed from the tab order — the discovery policy surfaced a
// mount indicator, nothing more (spec §6). The access affordance opens chat,
// where the principal can ask for help without the UI pretending a grant was
// created.

import { Link } from "@tanstack/react-router"
import { LockIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import type { OwnershipLabel } from "./types"

/** Quiet canonical-owner label. Rendered only with visible names; never
 *  styled like a permission badge — it is projection, not authority. */
export function OwnershipChip({
  label,
  testId,
}: {
  label: OwnershipLabel
  testId?: string
}) {
  if (!label.enteredViaName && !label.canonicalOwnerName) return null
  return (
    <p
      data-testid={testId ?? "ownership-chip"}
      className="text-[11px] text-muted-foreground"
    >
      {label.enteredViaName ? (
        <span>Viewing via {label.enteredViaName}</span>
      ) : null}
      {label.enteredViaName && label.canonicalOwnerName ? (
        <span aria-hidden> · </span>
      ) : null}
      {label.canonicalOwnerName ? (
        <span>Shared from {label.canonicalOwnerName}</span>
      ) : null}
    </p>
  )
}

export function MountChip({ ownerName }: { ownerName?: string }) {
  return (
    <span
      data-testid="mount-chip"
      className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground"
    >
      {ownerName ? `Shared from ${ownerName}` : "Shared"}
    </span>
  )
}

export interface HomeRowProps {
  readonly title: string
  readonly icon?: string
  readonly description?: string
  readonly href?: string
  readonly trailing?: ReactNode
  /** Roving tabindex: the section's key handler manages movement; the first
   *  row starts tabbable. */
  readonly first?: boolean
  readonly compact?: boolean
  readonly testId?: string
}

export function HomeRow({
  title,
  icon,
  description,
  href,
  trailing,
  first,
  compact,
  testId,
}: HomeRowProps) {
  const body = (
    <>
      {icon ? (
        <span aria-hidden className={compact ? "text-sm" : "text-base"}>
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">{title}</span>
        {description && !compact ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center">{trailing}</span>
      ) : null}
    </>
  )
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-md border border-transparent text-left transition-colors",
    compact ? "px-2 py-1.5" : "px-3 py-2",
    href
      ? "hover:border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "cursor-default",
  )
  if (href) {
    // TanStack Link, the house idiom: SPA navigation, and the string form
    // parses an embedded ?via= search param into typed route search.
    return (
      <Link
        data-home-row
        data-testid={testId}
        role="listitem"
        to={href}
        tabIndex={first ? 0 : -1}
        className={className}
      >
        {body}
      </Link>
    )
  }
  return (
    <div
      data-home-row
      data-testid={testId}
      role="listitem"
      tabIndex={first ? 0 : -1}
      className={className}
    >
      {body}
    </div>
  )
}

/** A mount the principal can see the existence of but cannot enter. The row
 *  itself is not a link and is skipped by the section's roving tabindex (no
 *  data-home-row) — a visible mount indicator is never a clickable dead-end.
 *  The access affordance is an ordinary, focusable link to chat. */
export function RestrictedHomeRow({ label }: { label: string }) {
  return (
    <div
      data-testid="restricted-row"
      role="listitem"
      className="flex w-full cursor-default items-center gap-2.5 rounded-md px-3 py-2 text-muted-foreground"
    >
      <LockIcon className="size-3.5" aria-hidden />
      <span className="flex-1 text-sm italic">{label}</span>
      <Link
        to="/chat"
        className="rounded-md border border-border px-2 py-0.5 text-[10px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ask about access
      </Link>
    </div>
  )
}
