"use client"

// AnnotationComposer — compose one annotation against the thing under review.
//
// A labeled kind selector (note / flag / question / approval, each an icon +
// word affordance, colored by its SEMANTIC tone), a body Textarea, and submit.
// Props-driven only: `onSubmit(kind, body)` is the seam; the host owns
// persistence, the anchor, and the author. Local state is just the draft
// (kind + body) — not derived state, so it lives in useState honestly.
//
// Dictation is deliberately NOT built in: the speech-recognition hook is
// host/browser territory. `dictationSlot` is an empty seam rendered in the
// action row so a host can drop its mic control in without this component
// depending on the Web Speech API.
//
// Tone map: note→muted, flag→warning, question→primary, approval→success —
// the same vocabulary the review minimap uses, never raw palette.

import { useState, type ReactNode } from "react"
import { cva } from "class-variance-authority"
import { MessageSquareIcon, FlagIcon, HelpCircleIcon, CheckIcon, type LucideIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { toneBgVariants, toneBorderVariants, toneTextVariants, type Tone } from "@workspace/ui/lib/tone"
import type { AnnotationKind } from "@workspace/review/lib/types"

const KIND_META: Record<AnnotationKind, { label: string; Icon: LucideIcon; tone: Tone }> = {
  note: { label: "Note", Icon: MessageSquareIcon, tone: "muted" },
  flag: { label: "Flag", Icon: FlagIcon, tone: "warning" },
  question: { label: "Question", Icon: HelpCircleIcon, tone: "primary" },
  approval: { label: "Approval", Icon: CheckIcon, tone: "success" },
}

const DEFAULT_KINDS: readonly AnnotationKind[] = ["note", "flag", "question", "approval"]

// Base chip; when unselected it's a quiet muted affordance, when selected the
// caller layers the kind's tone tint/border/text on top.
const kindChipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-3.5",
  {
    variants: {
      selected: { true: "", false: "border-transparent bg-muted text-muted-foreground hover:bg-muted/70" },
    },
    defaultVariants: { selected: false },
  }
)

function AnnotationComposer({
  onSubmit,
  kinds = DEFAULT_KINDS,
  initialKind = "note",
  placeholder = "Your note on this passage…",
  submitLabel = "Save",
  dictationSlot,
  disabled = false,
  className,
}: {
  /** The only seam: host owns the anchor, author, id, and persistence. */
  onSubmit: (kind: AnnotationKind, body: string) => void
  /** Which kinds to offer (defaults to all four). */
  kinds?: readonly AnnotationKind[]
  initialKind?: AnnotationKind
  placeholder?: string
  submitLabel?: string
  /** Host-owned dictation control (mic button) rendered in the action row. */
  dictationSlot?: ReactNode
  disabled?: boolean
  className?: string
}) {
  const [kind, setKind] = useState<AnnotationKind>(initialKind)
  const [body, setBody] = useState("")

  const canSubmit = body.trim().length > 0 && !disabled

  const submit = () => {
    if (!canSubmit) return
    onSubmit(kind, body.trim())
    setBody("")
  }

  return (
    <div data-slot="annotation-composer" className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Annotation kind">
        {kinds.map((k) => {
          const { label, Icon, tone } = KIND_META[k]
          const selected = kind === k
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(k)}
              className={cn(
                kindChipVariants({ selected }),
                selected && cn(toneBgVariants({ tone }), toneBorderVariants({ tone }), toneTextVariants({ tone }))
              )}
            >
              <Icon />
              {label}
            </button>
          )
        })}
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[96px] text-base md:min-h-[72px] md:text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit()
        }}
      />

      <div className="flex items-center justify-end gap-2">
        {dictationSlot}
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

export { AnnotationComposer }
