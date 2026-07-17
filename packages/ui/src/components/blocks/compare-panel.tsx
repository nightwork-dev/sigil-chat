// Block: ComparePanel
//
// The one adjudication grammar: an optional current item plus N arbitrary
// candidate slots, accept exactly one. Promoted to a Block because it is
// composed (panels + buttons + badges + empty-state) AND canonical — three
// near-identical compare surfaces in the source app collapse onto this.
//
// Generic slots only: each candidate renders a caller-supplied `content`
// node (an audio player, an image, a text diff — the caller's concern). No
// media-player, image, or domain assumptions. Acceptance is display-shaped:
// `onAccept(id)` / `onReject?(id)` callbacks, `pendingId` (mutation in flight
// → all actions disabled), `acceptedId` (resolved → accepted candidate
// marked, others muted but legible). Resolved state is readable without color
// alone: an "Accepted" badge + ring, not just a tint.

import type { ReactNode } from "react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"

export type CandidateState = "open" | "pending" | "accepted" | "rejected"

/**
 * Resolve a candidate's adjudication state from the panel-level signals.
 *
 *   - acceptedId set  → this candidate is "accepted" (==), all others "rejected"
 *   - else pendingId set → "pending" for every candidate (mutation in flight)
 *   - otherwise → "open"
 *
 * Pure so the render path and the unit tests share one definition.
 */
export function resolveCandidateState(
  id: string,
  pendingId?: string | null,
  acceptedId?: string | null,
): CandidateState {
  if (acceptedId != null) return id === acceptedId ? "accepted" : "rejected"
  if (pendingId != null) return "pending"
  return "open"
}

export interface CompareCandidate {
  id: string
  /** Arbitrary slot content — the thing being compared (caller's concern). */
  content: ReactNode
  /** Optional per-candidate note rendered under the content. */
  note?: ReactNode
  /** Optional label override; defaults to A, B, C… (String.fromCharCode(65+i)). */
  label?: ReactNode
}

export interface ComparePanelProps {
  /** Optional "current" item shown above the candidates. */
  current?: ReactNode
  candidates: CompareCandidate[]
  onAccept: (id: string) => void
  onReject?: (id: string) => void
  /** Id of the candidate whose accept mutation is in flight (disables all actions). */
  pendingId?: string | null
  /** Id of the accepted candidate (renders the resolved state). */
  acceptedId?: string | null
  className?: string
}

function candidateGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1"
  if (count === 2) return "grid-cols-1 sm:grid-cols-2"
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
}

function ComparePanel({
  current,
  candidates,
  onAccept,
  onReject,
  pendingId = null,
  acceptedId = null,
  className,
}: ComparePanelProps) {
  const resolved = acceptedId != null
  const actionsDisabled = pendingId != null || resolved

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {current ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Current
          </span>
          <div className="mt-1 min-w-0">{current}</div>
        </div>
      ) : null}

      {candidates.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No candidates yet</EmptyTitle>
            <EmptyDescription>Add candidates to compare them side by side.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          role="group"
          aria-label="Candidates"
          aria-busy={pendingId != null || undefined}
          className={cn("grid gap-3", candidateGridClass(candidates.length))}
        >
          {candidates.map((candidate, index) => {
            const label = candidate.label ?? String.fromCharCode(65 + index)
            const state = resolveCandidateState(candidate.id, pendingId, acceptedId)
            const isPendingSelf = state === "pending" && candidate.id === pendingId
            return (
              <div
                key={candidate.id}
                data-slot="compare-candidate"
                data-state={state}
                aria-label={`Candidate ${label}`}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border border-border bg-card p-3",
                  state === "accepted" && "ring-2 ring-primary",
                  state === "rejected" && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {label}
                  </span>
                  {state === "accepted" ? (
                    <Badge variant="default">Accepted</Badge>
                  ) : null}
                </div>

                <div className="min-w-0">{candidate.content}</div>

                {candidate.note ? (
                  <div className="text-xs text-muted-foreground">{candidate.note}</div>
                ) : null}

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => onAccept(candidate.id)}
                    disabled={actionsDisabled}
                    aria-label={`Accept candidate ${label}`}
                  >
                    Accept
                  </Button>
                  {onReject ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onReject(candidate.id)}
                      disabled={actionsDisabled}
                      aria-label={`Reject candidate ${label}`}
                    >
                      Reject
                    </Button>
                  ) : null}
                  {isPendingSelf ? (
                    <span
                      role="status"
                      className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                    >
                      Accepting…
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { ComparePanel }
