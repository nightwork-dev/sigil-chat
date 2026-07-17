import { CodeBlock } from "@workspace/ui/components/code-block"

export function JsonValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <CodeBlock
        className="max-h-48 p-2 text-[10px]"
        code={formatValue(value)}
        language="json"
      />
    </div>
  )
}

export function formatValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
