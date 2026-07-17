"use client"

import { useCallback } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { useThemeColors, withAlpha } from "@workspace/ui/hooks/use-theme-colors"

export interface PianoNote {
  id: string
  pitch: number // MIDI note number
  step: number // time step index
  velocity: number // 0-1
}

export interface PianoRollProps {
  notes: PianoNote[]
  steps?: number
  pitchRange?: [number, number] // [low, high] inclusive
  cellSize?: number
  onChange?: (notes: PianoNote[]) => void
  className?: string
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

let noteIdCounter = 0
function nextNoteId() {
  return `pn-${++noteIdCounter}-${Date.now()}`
}

function noteName(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`
}

function PianoRoll({
  notes,
  steps = 16,
  pitchRange = [48, 72],
  cellSize = 16,
  onChange,
  className,
}: PianoRollProps) {
  const themeColors = useThemeColors()
  const [lowPitch, highPitch] = pitchRange
  const totalPitches = highPitch - lowPitch + 1
  const pitches = Array.from({ length: totalPitches }, (_, i) => highPitch - i)

  const keyLabelWidth = 32
  const headerHeight = 14
  const gridWidth = steps * cellSize
  const gridHeight = totalPitches * cellSize

  const noteAt = useCallback(
    (pitch: number, step: number): number => {
      return notes.findIndex((n) => n.pitch === pitch && n.step === step)
    },
    [notes],
  )

  const toggleNote = useCallback(
    (pitch: number, step: number) => {
      if (!onChange) return
      const idx = noteAt(pitch, step)
      if (idx >= 0) {
        onChange(notes.filter((_, i) => i !== idx))
      } else {
        onChange([...notes, { id: nextNoteId(), pitch, step, velocity: 0.8 }])
      }
    },
    [notes, noteAt, onChange],
  )

  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const step = Math.floor(x / cellSize)
      const row = Math.floor(y / cellSize)
      const pitch = highPitch - row
      if (step >= 0 && step < steps && pitch >= lowPitch && pitch <= highPitch) {
        toggleNote(pitch, step)
      }
    },
    [cellSize, steps, highPitch, lowPitch, toggleNote],
  )

  return (
    <div
      data-slot="piano-roll"
      className={cn(
        "overflow-auto rounded-md border border-border bg-black/20",
        className,
      )}
    >
      <div className="flex" style={{ width: keyLabelWidth + gridWidth }}>
        {/* Piano key labels */}
        <div className="shrink-0" style={{ width: keyLabelWidth }}>
          {/* Header spacer */}
          <div style={{ height: headerHeight }} />
          {pitches.map((pitch) => {
            const isBlack = BLACK_KEYS.has(pitch % 12)
            const isC = pitch % 12 === 0
            return (
              <div
                key={pitch}
                className={cn(
                  "flex items-center justify-end pr-1 border-b border-border/30",
                  isBlack ? "bg-black/50" : "bg-white/[0.03]",
                )}
                style={{ height: cellSize, width: keyLabelWidth }}
              >
                <span
                  className={cn(
                    "font-mono text-[7px] font-medium",
                    isC ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {noteName(pitch)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Grid area */}
        <div className="relative">
          {/* Step number header */}
          <div className="flex" style={{ height: headerHeight }}>
            {Array.from({ length: steps }, (_, step) => (
              <div
                key={step}
                className={cn(
                  "flex items-center justify-center font-mono text-[6px] font-medium",
                  step % 4 === 0 ? "text-foreground" : "text-muted-foreground/50",
                )}
                style={{ width: cellSize }}
              >
                {step + 1}
              </div>
            ))}
          </div>

          {/* Note grid */}
          <div
            className="relative cursor-crosshair"
            style={{ width: gridWidth, height: gridHeight }}
            onClick={handleGridClick}
          >
            {/* Row backgrounds */}
            {pitches.map((pitch, row) => {
              const isBlack = BLACK_KEYS.has(pitch % 12)
              const isOctaveBorder = pitch % 12 === 0
              return (
                <div
                  key={pitch}
                  className={cn(
                    "absolute left-0 right-0",
                    isBlack && "bg-black/20",
                  )}
                  style={{
                    top: row * cellSize,
                    height: cellSize,
                    borderBottom: `0.5px solid rgba(255,255,255,${isOctaveBorder ? 0.08 : 0.025})`,
                  }}
                />
              )
            })}

            {/* Vertical beat lines */}
            {Array.from({ length: steps + 1 }, (_, step) => (
              <div
                key={step}
                className="absolute top-0 bottom-0"
                style={{
                  left: step * cellSize,
                  width: step % 4 === 0 ? 1 : 0.5,
                  backgroundColor: `rgba(255,255,255,${step % 4 === 0 ? 0.08 : 0.025})`,
                }}
              />
            ))}

            {/* Notes */}
            {notes.map((note) => {
              if (note.pitch < lowPitch || note.pitch > highPitch || note.step >= steps) return null
              const row = highPitch - note.pitch
              const x = note.step * cellSize + 1
              const y = row * cellSize + 1
              return (
                <div
                  key={note.id}
                  className="absolute rounded-[2px] border border-primary/60"
                  style={{
                    left: x,
                    top: y,
                    width: cellSize - 2,
                    height: cellSize - 2,
                    backgroundColor: withAlpha(themeColors.primary, note.velocity * 0.8 + 0.2),
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export { PianoRoll }
