"use client"

// ReviewDebtPanel — the triage surface for REVIEW DEBT: active annotations
// whose anchor no longer resolves (the content they pointed at moved or was
// cut). Surfacing these is the whole point — review must never silently lose a
// flag when a draft changes underneath it.
//
// The orphan set is DERIVED, not stored: pass the full annotation list and it
// runs `findOrphanAnnotations` (the headless rulebook) through useMemo — no
// useEffect, no reimplemented filter. Each orphan offers the three triage
// moves as host seams: Dismiss (reject), Convert (promote to a durable note),
// Jump (optional — only rendered when the host can locate nearest context).
//
// Tone map matches the composer: flag→warning, question→primary,
// approval→success, note→muted — semantic tokens, never raw palette.

import { useMemo, type ReactNode } from "react"
import { AlertTriangleIcon, MessageSquareIcon, FlagIcon, HelpCircleIcon, CheckIcon, type LucideIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { toneBgVariants, toneTextVariants, type Tone } from "@workspace/ui/lib/tone"
import { findOrphanAnnotations } from "@workspace/review/lib/logic"
import type { Annotation, AnnotationKind } from "@workspace/review/lib/types"

const KIND_META: Record<AnnotationKind, { Icon: LucideIcon; tone: Tone }> = {
  note: { Icon: MessageSquareIcon, tone: "muted" },
  flag: { Icon: FlagIcon, tone: "warning" },
  question: { Icon: HelpCircleIcon, tone: "primary" },
  approval: { Icon: CheckIcon, tone: "success" },
}

function ReviewDebtPanel<TAnchor = unknown>({
  annotations,
  onDismiss,
  onConvert,
  onJump,
  emptyLabel = "No orphaned annotations.",
  className,
}: {
  /** Full annotation list; the orphans are derived here via findOrphanAnnotations. */
  annotations: readonly Annotation<TAnchor>[]
  onDismiss: (id: string) => void
  onConvert: (id: string) => void
  /** Optional — render a Jump action only when the host can locate context. */
  onJump?: (annotation: Annotation<TAnchor>) => void
  emptyLabel?: ReactNode
  className?: string
}) {
  const orphans = useMemo(() => findOrphanAnnotations(annotations), [annotations])

  if (orphans.length === 0) {
    return <p className={cn("px-1 py-2 text-xs text-muted-foreground", className)}>{emptyLabel}</p>
  }

  return (
    <section data-slot="review-debt-panel" className={cn("space-y-3", className)}>
      <h2 className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-warning">
        <AlertTriangleIcon className="size-3" /> Orphaned · {orphans.length}
      </h2>
      <div className="space-y-2">
        {orphans.map((orphan) => (
          <OrphanCard
            key={orphan.id}
            orphan={orphan}
            onDismiss={onDismiss}
            onConvert={onConvert}
            onJump={onJump}
          />
        ))}
      </div>
    </section>
  )
}

function OrphanCard<TAnchor>({
  orphan,
  onDismiss,
  onConvert,
  onJump,
}: {
  orphan: Annotation<TAnchor>
  onDismiss: (id: string) => void
  onConvert: (id: string) => void
  onJump?: (annotation: Annotation<TAnchor>) => void
}) {
  const { Icon, tone } = KIND_META[orphan.kind]
  return (
    <article className="rounded-lg border border-border/70 bg-card/45 p-3">
      <div className="mb-2 flex items-start gap-2">
        <Icon className={cn("mt-0.5 size-3 shrink-0", toneTextVariants({ tone }))} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] text-muted-foreground">{orphan.id}</p>
          <p className="mt-1 text-xs leading-relaxed">{orphan.body}</p>
        </div>
        <Badge
          variant="outline"
          className={cn("border-transparent text-[10px]", toneBgVariants({ tone }), toneTextVariants({ tone }))}
        >
          {orphan.kind}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {onJump && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onJump(orphan)}>
            Jump to context
          </Button>
        )}
        <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={() => onConvert(orphan.id)}>
          Convert to note
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => onDismiss(orphan.id)}
        >
          Dismiss
        </Button>
      </div>
    </article>
  )
}

export { ReviewDebtPanel }
