"use client"

import { useCallback } from "react"
import { cn } from "@workspace/ui/lib/utils"

export interface SequencerProps {
  /** Number of steps (columns) */
  steps?: number
  /** Number of channels (rows) */
  channels?: number
  /** Pattern grid: pattern[channel][step] */
  pattern: boolean[][]
  /** Called when a cell is toggled */
  onPatternChange?: (pattern: boolean[][]) => void
  /** Color per channel (CSS color strings) */
  channelColors?: string[]
  /** Currently playing step index, or null */
  currentStep?: number | null
  /** Size of each cell in px */
  cellSize?: number
  className?: string
}

const DEFAULT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-1))",
]

export function Sequencer({
  steps = 16,
  channels = 4,
  pattern,
  onPatternChange,
  channelColors,
  currentStep = null,
  cellSize = 20,
  className,
}: SequencerProps) {
  const gap = 2

  const colorForChannel = useCallback(
    (ch: number) => {
      if (channelColors && ch < channelColors.length) return channelColors[ch]
      return DEFAULT_COLORS[ch % DEFAULT_COLORS.length]
    },
    [channelColors],
  )

  const toggleCell = useCallback(
    (ch: number, st: number) => {
      if (!onPatternChange) return
      const next = pattern.map((row, i) =>
        i === ch ? row.map((v, j) => (j === st ? !v : v)) : [...row],
      )
      onPatternChange(next)
    },
    [pattern, onPatternChange],
  )

  return (
    <div
      data-slot="sequencer"
      className={cn(
        "relative inline-block rounded-md border border-border bg-black/25 p-1.5",
        className,
      )}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${steps}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${channels}, ${cellSize}px)`,
          gap: `${gap}px`,
        }}
      >
        {Array.from({ length: channels }, (_, ch) =>
          Array.from({ length: steps }, (_, st) => {
            const isActive =
              ch < pattern.length &&
              st < pattern[ch].length &&
              pattern[ch][st]
            const isCurrent = currentStep === st
            const color = colorForChannel(ch)
            const isBeatLine = st > 0 && st % 4 === 0

            return (
              <button
                key={`${ch}-${st}`}
                type="button"
                onClick={() => toggleCell(ch, st)}
                className={cn(
                  "rounded-[2px] border transition-colors",
                  isBeatLine && ch === 0 && "border-l-muted-foreground/15",
                )}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: isActive
                    ? color
                    : undefined,
                  opacity: isActive
                    ? isCurrent
                      ? 1
                      : 0.75
                    : isCurrent
                      ? 0.12
                      : 0.06,
                  borderColor: isCurrent
                    ? "hsl(var(--border) / 0.6)"
                    : "hsl(var(--border) / 0.3)",
                  boxShadow: isActive && isCurrent
                    ? `0 0 6px ${color}`
                    : undefined,
                }}
              />
            )
          }),
        )}
      </div>

      {/* Beat group markers */}
      {Array.from(
        { length: Math.floor((steps - 1) / 4) },
        (_, i) => {
          const st = (i + 1) * 4
          const x = 6 + st * (cellSize + gap) - gap / 2
          return (
            <div
              key={`beat-${st}`}
              className="pointer-events-none absolute top-1.5 border-l border-dashed border-muted-foreground/15"
              style={{
                left: x,
                height: channels * (cellSize + gap) - gap,
              }}
            />
          )
        },
      )}

      {/* Playback position indicator */}
      {currentStep != null && currentStep >= 0 && currentStep < steps && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-foreground/25"
          style={{
            left:
              6 + currentStep * (cellSize + gap) + cellSize / 2,
          }}
        />
      )}
    </div>
  )
}
