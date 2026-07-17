// Shared color conversion core — pure math, no React/DOM.
//
// ColorWheel (hue-ring + saturation/brightness square) and ColorInput (HSB
// channel sliders + hex readout) are genuinely different affordances over
// the same HSB color model (component-development skill, RULE 0: distinct
// affordances stay separate components, but the underlying math is the
// same math and belongs in one place). This module is that place.

import { clamp } from "@workspace/ui/lib/interaction"

export interface HSBColor {
  h: number // 0-360
  s: number // 0-1
  b: number // 0-1
}

export type RGBTuple = [r: number, g: number, b: number]

/** HSB -> RGB (each channel 0-255, rounded). Hue wraps; s/b clamp to [0,1]. */
export function hsbToRgb({ h, s, b }: HSBColor): RGBTuple {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 1)
  const bri = clamp(b, 0, 1)

  const c = bri * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = bri - c
  let r = 0
  let g = 0
  let bl = 0
  if (hue < 60) [r, g] = [c, x]
  else if (hue < 120) [r, g] = [x, c]
  else if (hue < 180) [g, bl] = [c, x]
  else if (hue < 240) [g, bl] = [x, c]
  else if (hue < 300) [r, bl] = [x, c]
  else [r, bl] = [c, x]

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((bl + m) * 255),
  ]
}

/** RGB tuple -> `#rrggbb`, clamping each channel to [0,255]. */
export function rgbToHex([r, g, b]: RGBTuple): string {
  const hex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/** HSB -> `#rrggbb`. */
export function hsbToHex(hsb: HSBColor): string {
  return rgbToHex(hsbToRgb(hsb))
}

/**
 * `#rgb` / `#rrggbb` (with or without leading `#`) -> HSB. Malformed input
 * (wrong length, non-hex characters) falls back to black ({h:0,s:0,b:0})
 * rather than propagating NaNs.
 */
export function hexToHsb(hex: string): HSBColor {
  let h = hex.trim().replace(/^#/, "")
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { h: 0, s: 0, b: 0 }

  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let hue = 0
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6
    else if (max === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
    hue *= 60
    if (hue < 0) hue += 360
  }

  return { h: hue, s: max === 0 ? 0 : d / max, b: max }
}

/** HSB -> `rgb(r,g,b)` CSS color string. */
export function hsbToCss(hsb: HSBColor): string {
  const [r, g, b] = hsbToRgb(hsb)
  return `rgb(${r},${g},${b})`
}
