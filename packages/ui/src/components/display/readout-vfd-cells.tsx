"use client"

// The blue-green phosphor glow tracks the active theme's --color-info token
// (a cool blue-teal in every theme), so the VFD stays theme-aware instead of
// pinning a fixed cyan. color-mix derives the dark panel + ghost/glow alphas
// off that same token, with a near-black floor so it always reads as a dark
// vacuum-fluorescent panel. Unlike LCD, VFD has no switchable phosphor axis
// today — there's nothing here to wire the Readout `glow` prop into.
const PANEL_BG = "color-mix(in srgb, var(--color-info) 9%, #04070a)"
const GHOST = "color-mix(in srgb, var(--color-info) 12%, transparent)"
const GLOW = "color-mix(in srgb, var(--color-info) 55%, transparent)"

export interface VfdCellsProps {
  value: string | number
  columns?: number
  fontSize?: number
}

function cells(value: string, columns: number): string[] {
  if (value.length >= columns) return Array.from(value.slice(0, columns))
  return Array.from(value + " ".repeat(columns - value.length))
}

export function VfdCells({ value, columns, fontSize = 20 }: VfdCellsProps) {
  const text = String(value)
  const cols = columns ?? Math.max(1, text.length)
  const chars = cells(text, cols)
  const charWidth = fontSize * 0.68
  const charHeight = fontSize * 1.35

  return (
    <div
      className="relative overflow-hidden rounded-md border border-border p-2"
      style={{ backgroundColor: PANEL_BG }}
    >
      {/* Faint fine-pitch grille — the VFD segment texture. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)",
        }}
      />

      <div className="flex">
        {chars.map((char, i) => (
          <div
            key={i}
            className="relative flex items-center justify-center font-mono font-semibold"
            style={{ width: charWidth, height: charHeight, fontSize }}
          >
            {/* Ghost cell — the always-lit segment substrate. */}
            <span
              className="absolute select-none"
              style={{ color: GHOST, fontSize }}
              aria-hidden
            >
              8
            </span>

            {/* Active glyph with layered phosphor bloom. */}
            {char !== " " && (
              <span
                className="relative z-10"
                style={{
                  color: "var(--color-info)",
                  textShadow: `0 0 4px ${GLOW}, 0 0 9px ${GLOW}`,
                }}
              >
                {char}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
