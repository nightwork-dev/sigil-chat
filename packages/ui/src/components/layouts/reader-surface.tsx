// Layout: ReaderSurface
//
// A long-form reading surface — the typographic frame you drop prose,
// article bodies, or rendered markdown into so it reads like something meant
// to be read rather than a data panel. Sets a comfortable base size/leading
// (16px/1.75 on mobile, easing to 15px/relaxed on desktop) and a density
// variant that trades vertical breathing room for compactness. Pair the
// `measure` variant with a max content width so lines don't run past a
// legible measure (~66ch).
//
// It is deliberately unstyled beyond rhythm and measure — it does NOT impose
// heading/list/link styling, so combine it with your prose/typography styles
// (e.g. a `prose`-style utility) for the actual element treatment. Pure CSS,
// no hooks — safe to render on the server.
//
// When NOT to use: dashboards, forms, tables, or any dense tool chrome — this
// is for continuous reading, not UI.

import type { ComponentProps } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const readerSurfaceVariants = cva(
  "text-[16px] leading-7 md:text-[15px] md:leading-relaxed",
  {
    variants: {
      density: {
        comfortable: "px-1 py-3 md:px-2 md:py-4 lg:px-3",
        compact: "px-1 py-3 md:px-2 md:py-4",
      },
      measure: {
        default: "",
        narrow: "mx-auto max-w-[60ch]",
        wide: "mx-auto max-w-[75ch]",
      },
    },
    defaultVariants: {
      density: "comfortable",
      measure: "default",
    },
  },
)

function ReaderSurface({
  className,
  density,
  measure,
  ...props
}: ComponentProps<"article"> & VariantProps<typeof readerSurfaceVariants>) {
  return (
    <article
      data-slot="reader-surface"
      className={cn(readerSurfaceVariants({ density, measure, className }))}
      {...props}
    />
  )
}

export { ReaderSurface, readerSurfaceVariants }
