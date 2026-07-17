// Figure: a compound (Root/Image/Caption/Credit) semantic <figure> — an image
// paired with a caption and an optional credit/attribution line.
//
// Compound Root/Parts + Context (per the repo standard for multi-part domain
// objects): Figure.Root renders the <figure> and shares its `alt`/`src` through
// context so Figure.Image needs no props at the call site, while Caption/Credit
// live inside a single semantic <figcaption>. Composition is the point — the
// same figure reads differently by which parts you include and how you order
// them, without forking a component per layout.
//
//   <Figure.Root src="…" alt="A brass sextant">
//     <Figure.Image ratio="4/3" />
//     <Figure.Caption>Restored 1890s sextant.</Figure.Caption>
//     <Figure.Credit>Photo: Maritime Archive</Figure.Credit>
//   </Figure.Root>
//
// Reuses Image for the media (loading/error/fade story inherited for free).
// Tokens only: caption is text-foreground/muted-foreground, credit is the
// quieter text-muted-foreground/70 mono attribution register.

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Image, type ImageProps } from "@workspace/ui/components/image/image"

interface FigureContextValue {
  src: string
  alt: string
}

const FigureContext = React.createContext<FigureContextValue | null>(null)

function useFigure() {
  const ctx = React.useContext(FigureContext)
  if (!ctx) throw new Error("Figure parts must be used within <Figure.Root>")
  return ctx
}

function Root({
  src,
  alt,
  className,
  children,
  ...props
}: React.ComponentProps<"figure"> & { src: string; alt: string }) {
  return (
    <FigureContext.Provider value={{ src, alt }}>
      <figure
        data-slot="figure"
        className={cn("flex flex-col gap-2", className)}
        {...props}
      >
        {children}
      </figure>
    </FigureContext.Provider>
  )
}

function FigureImage({
  className,
  ...props
}: Omit<ImageProps, "src" | "alt">) {
  const { src, alt } = useFigure()
  return <Image src={src} alt={alt} className={className} {...props} />
}

function Caption({ className, ...props }: React.ComponentProps<"figcaption">) {
  return (
    <figcaption
      data-slot="figure-caption"
      className={cn(
        "text-xs/relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function Credit({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="figure-credit"
      className={cn(
        "font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70",
        className
      )}
      {...props}
    />
  )
}

export const Figure = { Root, Image: FigureImage, Caption, Credit }
