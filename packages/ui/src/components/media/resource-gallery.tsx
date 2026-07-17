// Block: ResourceGallery
//
// A composable gallery for browsing a set of resources (assets, references,
// attachments, media) as titled sections of cards. Assembled from small
// slot parts rather than one monolith so a caller can compose header +
// sections + grids to taste:
//
//   ResourceGallery                     — density-varianted vertical stack
//     ResourceGalleryHeader / Title / Description   — optional top matter
//     ResourceSection (title/count, optional collapsible <details>)
//       ResourceGrid (two | three | four columns)
//         ResourceCard (image, title, meta, status badge, actions, details)
//
// CVA drives the density (`compact` tightens the outer rhythm), the section
// chrome (`default` boxed vs `ghost` bare), and the grid column count. All
// surfaces sit on semantic tokens (border-border, bg-card, text-muted-
// foreground); the status Badge takes any Badge variant, so map a changed/
// active/error status onto warning/success/destructive at the call site
// rather than hardcoding a palette color here.
//
// When NOT to use: a single hero asset, or a virtualized/paged data table of
// thousands of rows — this is the "a handful of things, shown as cards"
// surface, not a data grid.

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

const resourceGalleryVariants = cva("space-y-4", {
  variants: {
    density: {
      compact: "space-y-3",
      default: "space-y-4",
    },
  },
  defaultVariants: {
    density: "default",
  },
})

function ResourceGallery({
  className,
  density,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof resourceGalleryVariants>) {
  return <div data-slot="resource-gallery" className={cn(resourceGalleryVariants({ density, className }))} {...props} />
}

function ResourceGalleryHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="resource-gallery-header" className={cn("flex items-center justify-between gap-3", className)} {...props} />
}

function ResourceGalleryTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="resource-gallery-title" className={cn("text-sm font-medium", className)} {...props} />
}

function ResourceGalleryDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="resource-gallery-description" className={cn("text-xs text-muted-foreground", className)} {...props} />
}

const resourceSectionVariants = cva("rounded-lg border border-border/60 bg-card/25 p-2", {
  variants: {
    variant: {
      default: "",
      ghost: "border-transparent bg-transparent p-0",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

interface ResourceSectionProps extends Omit<React.ComponentProps<"section">, "title">, VariantProps<typeof resourceSectionVariants> {
  title?: React.ReactNode
  description?: React.ReactNode
  count?: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}

function ResourceSection({
  title,
  description,
  count,
  collapsible = false,
  defaultOpen = true,
  variant,
  className,
  children,
  ...props
}: ResourceSectionProps) {
  const header = title || description || count ? (
    <ResourceSectionHeader title={title} description={description} count={count} />
  ) : null

  if (collapsible) {
    return (
      <details data-slot="resource-section" className={cn(resourceSectionVariants({ variant, className }))} open={defaultOpen}>
        {header && <summary className="cursor-pointer list-none rounded-md marker:hidden">{header}</summary>}
        {children}
      </details>
    )
  }

  return (
    <section data-slot="resource-section" className={cn(resourceSectionVariants({ variant, className }))} {...props}>
      {header}
      {children}
    </section>
  )
}

function ResourceSectionHeader({ title, description, count }: { title?: React.ReactNode; description?: React.ReactNode; count?: React.ReactNode }) {
  return (
    <div data-slot="resource-section-header" className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {title && <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</p>}
        {description && <p className="text-xs text-muted-foreground/75">{description}</p>}
      </div>
      {count != null && <Badge variant="outline" className="shrink-0 text-[10px]">{count}</Badge>}
    </div>
  )
}

const resourceGridVariants = cva("mt-2 grid gap-2", {
  variants: {
    columns: {
      two: "sm:grid-cols-2",
      three: "sm:grid-cols-2 lg:grid-cols-3",
      four: "sm:grid-cols-2 lg:grid-cols-4",
    },
  },
  defaultVariants: {
    columns: "three",
  },
})

function ResourceGrid({
  className,
  columns,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof resourceGridVariants>) {
  return <div data-slot="resource-grid" className={cn(resourceGridVariants({ columns, className }))} {...props} />
}

const resourceCardVariants = cva("overflow-hidden rounded-lg border border-border/70 bg-card/40", {
  variants: {
    density: {
      compact: "",
      default: "",
    },
  },
  defaultVariants: {
    density: "default",
  },
})

interface ResourceCardProps extends Omit<React.ComponentProps<"article">, "title">, VariantProps<typeof resourceCardVariants> {
  title: React.ReactNode
  meta?: React.ReactNode
  status?: React.ReactNode
  statusVariant?: React.ComponentProps<typeof Badge>["variant"]
  imageSrc?: string
  imageAlt?: string
  actions?: React.ReactNode
  details?: React.ReactNode
  detailsLabel?: React.ReactNode
}

function ResourceCard({
  title,
  meta,
  status,
  statusVariant = "outline",
  imageSrc,
  imageAlt = "",
  actions,
  details,
  detailsLabel = "Details",
  density,
  className,
  children,
  ...props
}: ResourceCardProps) {
  return (
    <article data-slot="resource-card" className={cn(resourceCardVariants({ density, className }))} {...props}>
      {imageSrc && (
        <div data-slot="resource-card-media" className="aspect-[4/3] overflow-hidden bg-muted/30">
          <img src={imageSrc} alt={imageAlt} loading="lazy" className="h-full w-full object-cover" />
        </div>
      )}
      <div data-slot="resource-card-body" className="space-y-2 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            {meta && <div className="truncate font-mono text-[10px] text-muted-foreground">{meta}</div>}
          </div>
          {status != null && <Badge variant={statusVariant} className="shrink-0 text-[10px]">{status}</Badge>}
        </div>
        {children}
        {actions && <div className="flex gap-1.5">{actions}</div>}
        {details && (
          <details className="border-t border-border/60 pt-2">
            <summary className="cursor-pointer list-none text-xs text-muted-foreground marker:hidden">{detailsLabel}</summary>
            <div className="mt-2 space-y-2">{details}</div>
          </details>
        )}
      </div>
    </article>
  )
}

export {
  ResourceCard,
  ResourceGallery,
  ResourceGalleryDescription,
  ResourceGalleryHeader,
  ResourceGalleryTitle,
  ResourceGrid,
  ResourceSection,
}
