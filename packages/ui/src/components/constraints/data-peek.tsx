// A collapsible <details>/<summary> table of raw values — the "show me the
// actual state" escape hatch. Tailored UIs render status through material
// (tracks, borders, handles) and can hide intermediate state behind
// animation; this always shows the unfiltered truth underneath.

import { cn } from "@workspace/ui/lib/utils"

interface DataPeekRow {
  id: string
  label: string
  status: string
  value: string
}

interface DataPeekProps {
  rows: DataPeekRow[]
  defaultOpen?: boolean
  summary?: string
  className?: string
}

function DataPeek({ rows, defaultOpen = false, summary = "Data readout", className }: DataPeekProps) {
  return (
    <details data-slot="data-peek" open={defaultOpen} className={cn("rounded-md border border-border bg-card/40 text-xs", className)}>
      <summary className="cursor-pointer select-none px-3 py-2 font-mono text-muted-foreground transition-colors hover:text-foreground">
        {summary}
      </summary>
      <div className="border-t border-border">
        <table className="w-full">
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 font-mono">{r.label}</td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.status}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export { DataPeek }
export type { DataPeekProps, DataPeekRow }
