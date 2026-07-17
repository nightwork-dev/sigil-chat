"use client"

// AcceptanceChecklist — the human sign-off gate. A checklist of concrete
// acceptance criteria + a reviewer field + optional device/notes, and a Submit
// that is INERT until every box is ticked. "Complete" is not judged here — it's
// `acceptanceComplete` from the headless rulebook, so the gate can't drift from
// the receipt logic that persists it.
//
// Props-driven / controlled: the checklist is owned by the host (`checklist` +
// `onToggle`), because the same checks may be persisted or shared. Reviewer /
// device / notes are ephemeral draft fields kept in local state. On submit the
// component hands the host a receipt INPUT (everything but the ref + timestamp,
// which are the host's to supply when it calls makeAcceptanceReceipt) — no
// Date.now in render, and none here either.
//
// No semantic color is invented: the only status signal is the disabled Submit,
// which already reads as "not yet". Restraint over a decorative green banner.

import { useState } from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import { acceptanceComplete } from "@workspace/review/lib/logic"
import type { AcceptanceCheck } from "@workspace/review/lib/types"

/** What onAccept receives — the receipt sans ref + timestamp (host supplies those). */
export interface AcceptanceInput {
  reviewer: string
  device?: string
  notes?: string
  checklist: AcceptanceCheck[]
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{children}</span>
  )
}

function AcceptanceChecklist({
  checklist,
  onToggle,
  onAccept,
  requireReviewer = true,
  showDevice = true,
  showNotes = true,
  submitLabel = "Accept",
  className,
}: {
  checklist: readonly AcceptanceCheck[]
  /** Host owns the checklist; toggling a box calls back with the next state. */
  onToggle: (id: string, checked: boolean) => void
  /** Fires only when the pass is complete — receives the receipt input. */
  onAccept: (input: AcceptanceInput) => void
  requireReviewer?: boolean
  showDevice?: boolean
  showNotes?: boolean
  submitLabel?: string
  className?: string
}) {
  const [reviewer, setReviewer] = useState("")
  const [device, setDevice] = useState("")
  const [notes, setNotes] = useState("")

  const complete = acceptanceComplete(checklist)
  const canAccept = complete && (!requireReviewer || reviewer.trim().length > 0)

  const submit = () => {
    if (!canAccept) return
    onAccept({
      reviewer: reviewer.trim(),
      device: device.trim() || undefined,
      notes: notes.trim() || undefined,
      checklist: checklist.map((c) => ({ ...c })),
    })
  }

  return (
    <section data-slot="acceptance-checklist" className={cn("space-y-4", className)}>
      <div className="space-y-1.5">
        {checklist.map((check) => (
          <Label key={check.id} className="items-start gap-2 text-xs font-normal text-muted-foreground">
            <Checkbox
              checked={check.checked}
              onCheckedChange={(checked) => onToggle(check.id, checked === true)}
              className="mt-0.5"
            />
            <span>{check.label}</span>
          </Label>
        ))}
        {checklist.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">No acceptance criteria.</p>
        )}
      </div>

      <div className="space-y-3">
        <label className="block space-y-1">
          <FieldLabel>Reviewer</FieldLabel>
          <Input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="name" />
        </label>
        {showDevice && (
          <label className="block space-y-1">
            <FieldLabel>Device / browser</FieldLabel>
            <Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="iPhone Safari, Android Chrome…" />
          </label>
        )}
        {showNotes && (
          <label className="block space-y-1">
            <FieldLabel>Notes</FieldLabel>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What felt good or bad? Any blockers?"
              className="min-h-20"
            />
          </label>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          {checklist.filter((c) => c.checked).length}/{checklist.length} checked
        </span>
        <Button size="sm" onClick={submit} disabled={!canAccept}>
          {submitLabel}
        </Button>
      </div>
    </section>
  )
}

export { AcceptanceChecklist }
