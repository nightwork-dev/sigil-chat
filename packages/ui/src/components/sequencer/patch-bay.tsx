"use client"

import { useCallback } from "react"
import { cn } from "@workspace/ui/lib/utils"

export interface PatchConnection {
  input: number
  output: number
}

export interface PatchBayProps {
  /** Input labels (column headers) */
  inputs: string[]
  /** Output labels (row headers) */
  outputs: string[]
  /** Active connections */
  connections: PatchConnection[]
  /** Called when connections change */
  onConnectionsChange?: (connections: PatchConnection[]) => void
  /** Size of each matrix cell in px */
  cellSize?: number
  className?: string
}

function hasConnection(connections: PatchConnection[], input: number, output: number) {
  return connections.some((c) => c.input === input && c.output === output)
}

export function PatchBay({
  inputs,
  outputs,
  connections,
  onConnectionsChange,
  cellSize = 28,
  className,
}: PatchBayProps) {
  const toggleConnection = useCallback(
    (input: number, output: number) => {
      if (!onConnectionsChange) return
      const exists = hasConnection(connections, input, output)
      if (exists) {
        onConnectionsChange(
          connections.filter((c) => !(c.input === input && c.output === output)),
        )
      } else {
        onConnectionsChange([...connections, { input, output }])
      }
    },
    [connections, onConnectionsChange],
  )

  return (
    <div
      data-slot="patch-bay"
      className={cn(
        "inline-block rounded-md border border-border bg-black/25 p-1.5",
        className,
      )}
    >
      {/* Column headers */}
      <div className="flex">
        <div className="shrink-0" style={{ width: 40, height: 16 }} />
        {inputs.map((label, i) => (
          <div
            key={i}
            className="flex items-center justify-center font-mono text-[7px] font-semibold tracking-wider uppercase text-muted-foreground leading-none"
            style={{ width: cellSize, height: 16 }}
          >
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>

      {/* Matrix rows */}
      {outputs.map((output, row) => (
        <div key={row} className="flex">
          {/* Row label */}
          <div
            className="flex shrink-0 items-center justify-end pr-1 font-mono text-[7px] font-semibold tracking-wider uppercase text-muted-foreground leading-none"
            style={{ width: 40, height: cellSize }}
          >
            <span className="truncate">{output}</span>
          </div>

          {/* Matrix cells */}
          {inputs.map((_, col) => {
            const isConnected = hasConnection(connections, col, row)
            const r = Math.min(cellSize, cellSize) * 0.28

            return (
              <button
                key={col}
                type="button"
                onClick={() => toggleConnection(col, row)}
                className="relative flex items-center justify-center border-[0.5px] border-border/15"
                style={{ width: cellSize, height: cellSize }}
              >
                {isConnected ? (
                  <>
                    {/* Glow */}
                    <div
                      className="absolute rounded-full bg-primary/30 blur-[2px]"
                      style={{ width: r * 4, height: r * 4 }}
                    />
                    {/* Filled circle */}
                    <div
                      className="relative rounded-full bg-primary"
                      style={{ width: r * 2, height: r * 2 }}
                    >
                      {/* Hot center */}
                      <div
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30"
                        style={{ width: r * 0.7, height: r * 0.7 }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Empty socket ring */}
                    <div
                      className="relative flex items-center justify-center rounded-full border border-border/50"
                      style={{ width: r * 2, height: r * 2 }}
                    >
                      {/* Inner depression */}
                      <div
                        className="rounded-full bg-black/20"
                        style={{ width: r * 0.8, height: r * 0.8 }}
                      />
                    </div>
                  </>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
