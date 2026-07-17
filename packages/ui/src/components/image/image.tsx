"use client"

// Image: the base image primitive the rest of the image/ family builds on.
//
// A plain <img> carries no failure story (a dead URL shows the browser's jagged
// broken glyph) and can jump the layout as it decodes. This wraps it in an
// aspect-locked, muted-filled box:
//   • `ratio` reserves the box up front via AspectRatio, so the layout never
//     shifts as the image loads (no CLS);
//   • the `bg-muted` field shows through until the pixels paint — a neutral
//     placeholder with NO JS load-state, which is the whole point: an <img>
//     that's already `complete` before React can attach an onLoad handler never
//     fires that event, so any design that gates the image's visibility on a
//     "loaded" flag leaves cached images blank forever. We don't depend on the
//     load event at all — the <img> simply paints when the browser decodes it.
//   • the only state is a single `onError` flag (event-driven, effect-free)
//     that swaps a failed URL for a NEUTRAL fallback field (bg-muted + a muted
//     ImageOff icon), never a broken-image glyph.
//
// `fit` picks object-cover (default, fills+crops) vs object-contain (letterboxed
// against the muted field). `rounded` is a CVA scale so callers pick a corner
// radius by name. `placeholder` (a CSS color/token) tints the reserved box for a
// blur-up feel. Lazy by default. Everything is semantic tokens.
//
// When NOT to use: a decorative CSS background (use a div + bg-image) or an
// avatar (use Avatar, which has its own fallback semantics).

import * as React from "react"
import { ImageOffIcon } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"
import { AspectRatio } from "@workspace/ui/components/aspect-ratio"

const RATIO_MAP: Record<string, number> = {
  "1/1": 1,
  "16/9": 16 / 9,
  "4/3": 4 / 3,
  "3/2": 3 / 2,
  "3/4": 3 / 4,
  "2/3": 2 / 3,
  "9/16": 9 / 16,
}

function resolveRatio(ratio: string | number | undefined): number | undefined {
  if (ratio === undefined) return undefined
  if (typeof ratio === "number") return ratio
  if (ratio in RATIO_MAP) return RATIO_MAP[ratio]
  // Accept an arbitrary "w/h" string too.
  const [w, h] = ratio.split("/").map(Number)
  return w && h ? w / h : undefined
}

const imageVariants = cva("overflow-hidden bg-muted", {
  variants: {
    rounded: {
      none: "rounded-none",
      sm: "rounded-sm",
      md: "rounded-md",
      lg: "rounded-lg",
      full: "rounded-full",
    },
  },
  defaultVariants: {
    rounded: "md",
  },
})

export interface ImageProps
  extends Omit<React.ComponentProps<"img">, "onError">,
    VariantProps<typeof imageVariants> {
  src: string
  alt: string
  /** Aspect ratio: a token ("1/1" | "16/9" | "4/3" | "3/2" …), an arbitrary "w/h", or a raw number. Reserves the box to prevent layout shift. */
  ratio?: "1/1" | "16/9" | "4/3" | "3/2" | (string & {}) | number
  /** object-fit inside the frame. Default "cover". */
  fit?: "cover" | "contain"
  /** Optional CSS color/token to tint the reserved box before pixels arrive (blur-up feel). */
  placeholder?: string
}

function Image({
  src,
  alt,
  ratio,
  fit = "cover",
  rounded,
  placeholder,
  className,
  loading = "lazy",
  style,
  ...props
}: ImageProps) {
  // The only state: did the image fail to load? Set from the <img>'s onError
  // event — an event handler, not a useEffect syncing derived state.
  const [errored, setErrored] = React.useState(false)
  const resolvedRatio = resolveRatio(ratio)

  const frame = (
    <div
      data-slot="image"
      data-status={errored ? "error" : "ok"}
      className={cn(imageVariants({ rounded }), "relative h-full w-full", className)}
      style={placeholder ? { backgroundColor: placeholder, ...style } : style}
    >
      {errored ? (
        <div
          data-slot="image-fallback"
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground"
        >
          <ImageOffIcon className="size-5 opacity-60" />
          <span className="max-w-[80%] truncate px-2 text-center font-mono text-[10px] uppercase tracking-wide opacity-60">
            unavailable
          </span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setErrored(true)}
          className={cn(
            "h-full w-full",
            fit === "contain" ? "object-contain" : "object-cover"
          )}
          {...props}
        />
      )}
    </div>
  )

  if (resolvedRatio !== undefined) {
    return <AspectRatio ratio={resolvedRatio}>{frame}</AspectRatio>
  }
  return frame
}

export { Image, imageVariants }
