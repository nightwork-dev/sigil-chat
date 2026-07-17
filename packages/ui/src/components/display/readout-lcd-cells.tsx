"use client"

import { useMemo } from "react"
import { phosphorRgba } from "@workspace/ui/lib/display-glow"

// Fixed CRT phosphor presets — kept as explicit overrides for when a
// specific historical look is wanted regardless of the active theme. The
// "theme" entry tracks the active theme's own curated phosphor color (see
// --display-* tokens in themes.css) via CSS var indirection, so it updates
// on a theme switch with no re-render. Consumed by <Readout variant="lcd">
// (and its LCDDisplay back-compat wrapper) to set --lcd-* on the shell.
export const LCD_BACKLIGHT_CONFIG = {
  theme: {
    bg: "var(--display-bg)",
    text: "var(--display-text)",
    ghost: "var(--display-ghost)",
    glow: "var(--display-glow)",
  },
  green: {
    bg: "#0a2a0a",
    text: "#33ff66",
    ghost: phosphorRgba("green", 0.08),
    glow: phosphorRgba("green", 0.4),
  },
  blue: {
    bg: "#0a1428",
    text: "#66ccff",
    ghost: phosphorRgba("blue", 0.08),
    glow: phosphorRgba("blue", 0.4),
  },
  amber: {
    bg: "#281a08",
    text: "#ffaa33",
    ghost: phosphorRgba("amber", 0.08),
    glow: phosphorRgba("amber", 0.4),
  },
  white: {
    bg: "#1a1a1e",
    text: "#d8dce0",
    ghost: "rgba(216, 220, 224, 0.08)",
    glow: "rgba(216, 220, 224, 0.4)",
  },
} as const

export type LCDBacklight = keyof typeof LCD_BACKLIGHT_CONFIG

export interface LcdCellsProps {
  value: string | number
  columns?: number
  rows?: number
  fontSize?: number
}

/**
 * The LCD "screen" — character grid + scanline overlay. Assumes an ancestor
 * (the Readout shell) has already set the --lcd-bg/--lcd-text/--lcd-ghost/
 * --lcd-glow CSS custom properties for the selected backlight; this
 * component only reads them, it doesn't choose the backlight itself.
 */
export function LcdCells({ value, columns = 16, rows = 2, fontSize = 14 }: LcdCellsProps) {
  const text = String(value)
  const charWidth = fontSize * 0.62
  const charHeight = fontSize * 1.4

  const gridLines = useMemo(() => {
    const lines = text.split("\n")
    const result: string[] = []
    for (let i = 0; i < rows; i++) {
      if (i < lines.length) {
        const line = lines[i]
        if (line.length >= columns) {
          result.push(line.slice(0, columns))
        } else {
          result.push(line + " ".repeat(columns - line.length))
        }
      } else {
        result.push(" ".repeat(columns))
      }
    }
    return result
  }, [text, columns, rows])

  const innerWidth = charWidth * columns
  const innerHeight = charHeight * rows
  const padH = 10
  const padV = 8

  return (
    <div
      className="relative overflow-hidden rounded-sm"
      style={{
        width: innerWidth + padH * 2,
        height: innerHeight + padV * 2,
        padding: `${padV}px ${padH}px`,
        backgroundColor: "var(--lcd-bg)",
      }}
    >
      {/* Scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.12) 1px, rgba(0,0,0,0.12) 2px)",
        }}
      />

      {/* Character grid */}
      {gridLines.map((line, row) => (
        <div key={row} className="flex" style={{ height: charHeight }}>
          {Array.from(line).map((char, col) => (
            <div
              key={col}
              className="relative flex items-center justify-center font-mono font-bold"
              style={{
                width: charWidth,
                height: charHeight,
                fontSize,
              }}
            >
              {/* Ghost cell — always visible */}
              <div
                className="absolute rounded-[1px]"
                style={{
                  inset: `2px 1px`,
                  backgroundColor: "var(--lcd-ghost)",
                }}
              />

              {/* Active character */}
              {char !== " " && (
                <span
                  className="relative z-10"
                  style={{
                    color: "var(--lcd-text)",
                    textShadow: `0 0 3px var(--lcd-glow), 0 0 6px var(--lcd-glow)`,
                  }}
                >
                  {char}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
