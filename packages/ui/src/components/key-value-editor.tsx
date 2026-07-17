"use client"

// A dynamic list of labeled textareas, one per key in a Record<string,
// string> — with per-field dirty tracking (a field that's been edited but
// not yet confirmed shows a confirm/cancel affordance). For prompt template
// variables, config key/value editors, or any "edit a bag of named strings"
// UI.

import { useState } from "react"
import { CheckIcon, XIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { Textarea } from "@workspace/ui/components/textarea"
import { Button } from "@workspace/ui/components/button"

interface KeyValueEditorProps {
  values: Record<string, string>
  /** Keys to render even if absent from `values` (starts them at ""). */
  alwaysShow?: string[]
  /** Keys to hide entirely. */
  omit?: string[]
  onCommit: (key: string, value: string) => void
  disabled?: boolean
  className?: string
  inputClassName?: string
}

function KeyValueEditor({ values, alwaysShow = [], omit = [], onCommit, disabled, className, inputClassName }: KeyValueEditorProps) {
  const keys = Array.from(new Set([...alwaysShow, ...Object.keys(values)]))
    .filter((k) => !omit.includes(k))
    .sort((a, b) => a.localeCompare(b))

  const [drafts, setDrafts] = useState<Record<string, string>>({})

  return (
    <div data-slot="key-value-editor" className={cn("flex flex-col gap-2", className)}>
      {keys.map((key) => {
        const committed = values[key] ?? ""
        const draft = drafts[key] ?? committed
        const dirty = draft !== committed

        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[11px] text-muted-foreground">{key}</label>
              {dirty && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`confirm ${key}`}
                    onClick={() => onCommit(key, draft)}
                  >
                    <CheckIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`cancel ${key}`}
                    onClick={() => setDrafts((prev) => ({ ...prev, [key]: committed }))}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <Textarea
              value={draft}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
              disabled={disabled}
              className={cn(dirty && "border-primary/50", inputClassName)}
            />
          </div>
        )
      })}
    </div>
  )
}

export { KeyValueEditor }
export type { KeyValueEditorProps }
