"use client"

import { useEffect, useState } from "react"

/**
 * Resolves CSS custom properties to actual color values for use in Canvas 2D.
 *
 * Canvas APIs (fillStyle, strokeStyle, addColorStop) cannot resolve CSS variables.
 * This hook reads the computed values from the DOM and re-resolves when the theme changes.
 *
 * Usage:
 *   const colors = useThemeColors()
 *   ctx.fillStyle = colors.primary  // "#d4a853" (resolved)
 */

const TOKEN_NAMES = [
  "primary",
  "primary-foreground",
  "foreground",
  "muted-foreground",
  "muted",
  "background",
  "card",
  "border",
  "destructive",
  "accent",
  "ring",
] as const

type TokenName = (typeof TOKEN_NAMES)[number]
type CamelToken<S extends string> = S extends `${infer A}-${infer B}`
  ? `${A}${Capitalize<CamelToken<B>>}`
  : S

export type ThemeColors = { [K in TokenName as CamelToken<K>]: string }

// SSR fallback — amber defaults (also matches the SSR-rendered theme class,
// since the server always renders theme-amber regardless of the client's
// persisted theme; see getSSRThemeClass in apps/web/src/lib/theme.tsx).
const SSR_DEFAULTS: ThemeColors = {
  primary: "#d4a853",
  primaryForeground: "#0d0b0f",
  foreground: "#e8e0d6",
  mutedForeground: "#8b8578",
  muted: "#1a1620",
  background: "#0d0b0f",
  card: "#151216",
  border: "#2a2530",
  destructive: "#e5484d",
  accent: "#1e1a20",
  ring: "#d4a853",
}

function resolve(): ThemeColors {
  if (typeof window === "undefined") {
    return SSR_DEFAULTS
  }
  const style = getComputedStyle(document.documentElement)
  const get = (name: string) => style.getPropertyValue(`--color-${name}`).trim() || "#888"
  return {
    primary: get("primary"),
    primaryForeground: get("primary-foreground"),
    foreground: get("foreground"),
    mutedForeground: get("muted-foreground"),
    muted: get("muted"),
    background: get("background"),
    card: get("card"),
    border: get("border"),
    destructive: get("destructive"),
    accent: get("accent"),
    ring: get("ring"),
  }
}

export function useThemeColors(): ThemeColors {
  // Initialize with the SSR defaults, not resolve(), even on the client.
  // This component may hydrate later than the root layout (e.g. inside a
  // lazy-loaded route), after the root's theme-init effect has already
  // swapped the <html> class to the persisted theme. Reading the live DOM
  // here would then return a different color than what the server rendered,
  // producing a hydration mismatch. Deferring the real read to the effect
  // below guarantees the first render always matches the server output.
  const [colors, setColors] = useState<ThemeColors>(SSR_DEFAULTS)

  useEffect(() => {
    // Re-resolve on theme change (class mutation on <html>)
    setColors(resolve())

    const observer = new MutationObserver(() => {
      setColors(resolve())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])

  return colors
}

/**
 * Resolve a single CSS color string for canvas use.
 * If it's a var() reference, resolves it. Otherwise passes through.
 */
export function resolveCanvasColor(color: string): string {
  if (typeof window === "undefined") return color
  // Handle "hsl(var(--primary))" or "hsl(var(--color-primary))" patterns
  const varMatch = color.match(/var\(--(?:color-)?([^)]+)\)/)
  if (varMatch) {
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-${varMatch[1]}`)
      .trim()
    return resolved || color
  }
  return color
}

/**
 * Apply alpha to a resolved hex color. For canvas contexts where
 * you need transparency variants of theme colors.
 */
export function withAlpha(hex: string, alpha: number): string {
  // Handle hex
  if (hex.startsWith("#")) {
    let h = hex.slice(1)
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    if (h.length >= 6) {
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return `rgba(${r},${g},${b},${alpha})`
    }
  }
  // Handle rgb/rgba
  if (hex.startsWith("rgb")) {
    const nums = hex.match(/[\d.]+/g)
    if (nums && nums.length >= 3) {
      return `rgba(${nums[0]},${nums[1]},${nums[2]},${alpha})`
    }
  }
  return hex
}
