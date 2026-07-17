// A draft value shown as JSON with a validity-status border/badge, and a
// commit button gated on that validity. For any "edit freeform, validate
// against a schema, commit when valid" flow — config editors, generated
// content review, form drafts backed by a zod (or any) validator.

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { CodeBlock } from "@workspace/ui/components/code-block"

export type DraftValidity = "valid" | "invalid" | "empty"

export interface ValidationResult {
  valid: boolean
  error?: string
}

interface ValidatedDraftProps {
  data: unknown
  /** Runs against `data`; return `{valid: true}` or `{valid: false, error}`. */
  validate: (data: unknown) => ValidationResult
  onCommit: (data: unknown) => void
  committing?: boolean
  className?: string
}

const borderByValidity: Record<DraftValidity, string> = {
  valid: "border-success/40",
  invalid: "border-warning/40",
  empty: "border-destructive/40",
}

function ValidatedDraft({ data, validate, onCommit, committing, className }: ValidatedDraftProps) {
  const isEmpty = data == null || (typeof data === "object" && Object.keys(data as object).length === 0)
  const result = isEmpty ? { valid: false } : validate(data)
  const validity: DraftValidity = isEmpty ? "empty" : result.valid ? "valid" : "invalid"

  return (
    <div data-slot="validated-draft" className={cn("flex flex-col gap-2 rounded-md border p-2", borderByValidity[validity], className)}>
      <CodeBlock code={JSON.stringify(data, null, 2)} language="json" />
      {!result.valid && result.error && (
        <div className="whitespace-pre-wrap break-words font-mono text-xs text-destructive">{result.error}</div>
      )}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCommit(data)}
          disabled={!result.valid || committing}
        >
          {committing ? "Committing…" : "Commit"}
        </Button>
      </div>
    </div>
  )
}

export { ValidatedDraft }
export type { ValidatedDraftProps }
