import type { ReactNode } from "react"

import { CodeBlock } from "@workspace/ui/components/code-block"
import { cn } from "@workspace/ui/lib/utils"

interface JsonValueProps {
  value: unknown
  label?: ReactNode
  className?: string
  codeClassName?: string
}

function JsonValue({ value, label, className, codeClassName }: JsonValueProps) {
  return (
    <div data-slot="json-value" className={className}>
      {label != null ? (
        <div
          data-slot="json-value-label"
          className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
        >
          {label}
        </div>
      ) : null}
      <CodeBlock
        className={cn("max-h-48 p-2 text-[10px]", codeClassName)}
        code={formatJsonValue(value)}
        language="json"
      />
    </div>
  )
}

function formatJsonValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined) return ""

  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

export { JsonValue, formatJsonValue }
export type { JsonValueProps }
