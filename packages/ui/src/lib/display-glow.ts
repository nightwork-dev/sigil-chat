/**
 * Shared CRT/phosphor hue palette.
 *
 * LCDDisplay (readout-renderers/lcd-cells.tsx) and Oscilloscope both render
 * a "glowing phosphor on dark glass" look and used to hardcode the same
 * green/amber/blue RGB triples independently. The hue now lives in exactly
 * one place; each caller still picks its own alpha via `phosphorRgba` since
 * LCD's text glow wants a stronger alpha than Oscilloscope's grid lines.
 */
export const PHOSPHOR_HEX = {
  green: "#33ff66",
  amber: "#ffaa33",
  blue: "#66ccff",
} as const

export type PhosphorColor = keyof typeof PHOSPHOR_HEX

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Render a phosphor hue at a given alpha, e.g. `phosphorRgba("green", 0.4)`. */
export function phosphorRgba(color: PhosphorColor, alpha: number): string {
  const [r, g, b] = hexToRgb(PHOSPHOR_HEX[color])
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
