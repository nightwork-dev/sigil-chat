// Home load-lifecycle states — the screens between "data" and "nothing".
//
// Denied follows the spec §7 product-home rule: a 403 body is shown only when
// the scope's existence is discoverable to the principal; otherwise the
// surface says "not found" and reveals nothing. Both are quiet — no ids, no
// names, no hints of the hidden scope's owner.

import { Link } from "@tanstack/react-router"
import { ArchiveIcon, LockIcon } from "lucide-react"

import { Skeleton } from "@workspace/ui/components/skeleton"

/** Per-section skeletons — never a whole-page spinner (proposal §4). */
export function HomeSkeleton() {
  return (
    <div
      data-testid="home-skeleton"
      aria-busy="true"
      aria-label="Loading"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      {["a", "b", "c"].map((key) => (
        <div key={key} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  )
}

export function HomeDenied({ discoverable }: { discoverable: boolean }) {
  return (
    <div
      data-testid={discoverable ? "home-denied" : "home-not-found"}
      role="status"
      className="mx-auto flex w-full max-w-md flex-col items-center gap-3 p-12 text-center"
    >
      <LockIcon className="size-6 text-muted-foreground" aria-hidden />
      {discoverable ? (
        <>
          <p className="text-sm font-medium">You don't have access to this.</p>
          <p className="text-xs text-muted-foreground">
            Ask someone who manages it to grant you access.
          </p>
          <Link
            to="/chat"
            className="mt-1 inline-flex min-h-11 items-center rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
          >
            Ask about access
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing here by that name.
        </p>
      )}
    </div>
  )
}

/** Archived homes are read-only; the banner states it once, up top. */
export function ArchivedBanner({ what }: { what: string }) {
  return (
    <div
      data-testid="archived-banner"
      role="status"
      className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
    >
      <ArchiveIcon className="size-3.5" aria-hidden />
      <span>This {what} is archived. Everything here is read-only.</span>
    </div>
  )
}

/** A section with no records. CTA copy is specific, never a blank gap. */
export function EmptySection({
  testId,
  message,
  action,
}: {
  testId?: string
  message: string
  action?: { readonly label: string; readonly href: string }
}) {
  return (
    <div
      data-testid={testId ?? "empty-section"}
      className="rounded-md border border-dashed border-border px-4 py-6 text-center"
    >
      <p className="text-xs text-muted-foreground">{message}</p>
      {action ? (
        <Link
          to={action.href}
          className="mt-2 inline-flex min-h-11 items-center rounded-md border border-border px-3 py-1 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}
