import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"

// A swatch's fill colors ARE its data (a palette entry, a theme's void/signal
// pair), so raw hex/rgba inputs are correct here — this is the one place raw
// colors are legitimate, not hardcoded chrome. Tokens handle the ring/border.

const colorSwatchVariants = cva(
  "rounded-full overflow-hidden ring-1 ring-border shrink-0 transition-all",
  {
    variants: {
      size: {
        sm: "size-4",
        md: "size-6",
        lg: "size-8",
      },
      active: {
        // Ring only — interaction scale belongs to the interactive wrapper,
        // not the display atom (a wrapper's hover:scale would compound it).
        true: "ring-2 ring-primary",
        false: "",
      },
    },
    defaultVariants: { size: "md", active: false },
  },
)

export type ColorSwatchProps = VariantProps<typeof colorSwatchVariants> & {
  /**
   * One color (solid), two (left/right split — the theme-void/signal case),
   * or many (equal pie segments via conic-gradient).
   */
  colors: string[] | string
  className?: string
}

/** Build a CSS background for the given color set. Pulled out as a pure fn. */
function swatchBackground(colors: string[]): string {
  if (colors.length === 0) return "transparent"
  if (colors.length === 1) return colors[0]!
  if (colors.length === 2) {
    return `linear-gradient(to right, ${colors[0]} 50%, ${colors[1]} 50%)`
  }
  const step = 360 / colors.length
  const stops = colors
    .map((c, i) => `${c} ${Math.round(i * step)}deg ${Math.round((i + 1) * step)}deg`)
    .join(", ")
  return `conic-gradient(${stops})`
}

function ColorSwatch({ colors, size, active, className }: ColorSwatchProps) {
  const arr = Array.isArray(colors) ? colors : [colors]
  return (
    <div
      data-slot="color-swatch"
      className={cn(colorSwatchVariants({ size, active }), className)}
      style={{ background: swatchBackground(arr) }}
    />
  )
}

export { ColorSwatch, colorSwatchVariants }
