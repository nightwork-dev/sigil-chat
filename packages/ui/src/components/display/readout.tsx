"use client"

import type { ComponentType, CSSProperties } from "react"
import { cva } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"
import { LcdCells, LCD_BACKLIGHT_CONFIG } from "./readout-lcd-cells"
import { VfdCells } from "./readout-vfd-cells"
import { SegmentDigits } from "./readout-segment-digits"
import { NixieGlyphs } from "./readout-nixie-glyphs"

/**
 * Superset of every renderer's own (narrower) prop type — each renderer
 * (LcdCells, VfdCells, SegmentDigits, NixieGlyphs) only destructures the
 * fields it actually uses, so passing this wider shape to any of them is
 * safe. This is what lets a single `RENDERERS` map route to all four.
 */
interface RendererProps {
  value: string | number
  columns?: number
  rows?: number
  fontSize?: number
  color?: string
  digitHeight?: number
  size?: number
}

/**
 * The unified surface for the four "glowing digital readout" displays —
 * LCD, VFD, seven-segment LED, and Nixie tube. They differ only in
 * rendering technology (aesthetic), not in the data they show, so a single
 * `<Readout variant="..." value={...} />` picks the renderer while the
 * digit-drawing logic itself lives in the sibling `readout-*-cells`/
 * `readout-*-glyphs`/`readout-*-digits` renderer files.
 *
 * LCDDisplay/VFD/LEDSegment/Nixie/NixieBank (the sibling files in this
 * directory) are thin back-compat wrappers around this component — they
 * keep their original prop names for existing consumers and map onto
 * Readout's props underneath.
 */
export type ReadoutVariant = "lcd" | "vfd" | "segment" | "nixie"

/** LCD's switchable backlight palette — the only variant with a glow axis today. */
export type ReadoutGlow = keyof typeof LCD_BACKLIGHT_CONFIG

export interface ReadoutProps extends RendererProps {
  variant: ReadoutVariant
  /** Caption below the panel — currently only rendered for variant="vfd". */
  label?: string
  /** Backlight/phosphor color override. Only meaningful for variant="lcd". */
  glow?: ReadoutGlow
  className?: string
}

const readoutShell = cva("inline-block", {
  variants: {
    variant: {
      lcd: "rounded-md border border-border bg-card",
      vfd: "inline-flex flex-col items-center gap-1.5",
      segment: "rounded border border-border bg-card",
      nixie: "",
    },
  },
  defaultVariants: { variant: "lcd" },
})

const RENDERERS: Record<ReadoutVariant, ComponentType<RendererProps>> = {
  lcd: LcdCells,
  vfd: VfdCells,
  segment: SegmentDigits,
  nixie: NixieGlyphs,
}

function Readout({
  variant,
  value,
  columns,
  rows,
  fontSize,
  color,
  digitHeight,
  size,
  label,
  glow = "theme",
  className,
}: ReadoutProps) {
  const Renderer = RENDERERS[variant]

  // Only the LCD renderer reads --lcd-* CSS custom properties; the shell is
  // where they're set so LcdCells stays oblivious to which backlight is active.
  const shellStyle: CSSProperties | undefined =
    variant === "lcd"
      ? ({
          "--lcd-bg": LCD_BACKLIGHT_CONFIG[glow].bg,
          "--lcd-text": LCD_BACKLIGHT_CONFIG[glow].text,
          "--lcd-ghost": LCD_BACKLIGHT_CONFIG[glow].ghost,
          "--lcd-glow": LCD_BACKLIGHT_CONFIG[glow].glow,
        } as CSSProperties)
      : undefined

  return (
    <div
      data-slot="readout"
      className={cn(readoutShell({ variant }), className)}
      style={shellStyle}
    >
      <Renderer
        value={value}
        columns={columns}
        rows={rows}
        fontSize={fontSize}
        color={color}
        digitHeight={digitHeight}
        size={size}
      />
      {label && variant === "vfd" && (
        <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground leading-none">
          {label}
        </span>
      )}
    </div>
  )
}

export { Readout }
