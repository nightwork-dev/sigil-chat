"use client"

// Lightbox: a thumbnail (or any trigger children) that opens the full image in
// a dimmed, contained overlay. A lightweight single-image zoom — no carousel,
// no pan/zoom gestures; the one job is "see this image big."
//
// Built on Dialog (base-ui) so backdrop click, Escape, focus trap, and scroll
// lock come for free. The default trigger is a rounded, focusable thumbnail
// (uses Image, inheriting its loading/error story); pass `children` to wrap an
// arbitrary trigger instead. The popup is a bare centered frame — no card
// chrome — so the image is the subject: object-contain inside a max-w/max-h box
// against the dimmed backdrop, with an optional caption strip beneath.
//
// Tokens only: the close affordance and caption ride on background/foreground/
// muted tokens; the backdrop is the Dialog's own scrim.

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import {
  Dialog,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Image } from "@workspace/ui/components/image/image"

export interface LightboxProps {
  src: string
  alt: string
  /** Smaller image for the trigger thumbnail. Falls back to `src`. */
  thumbnailSrc?: string
  /** Optional caption shown beneath the enlarged image. */
  caption?: React.ReactNode
  /** Custom trigger. When omitted, a default Image thumbnail is rendered. */
  children?: React.ReactNode
  className?: string
}

function Lightbox({
  src,
  alt,
  thumbnailSrc,
  caption,
  children,
  className,
}: LightboxProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          children ? (
            (children as React.ReactElement)
          ) : (
            <button
              type="button"
              aria-label={`View image: ${alt}`}
              className={cn(
                "group/lightbox block cursor-zoom-in overflow-hidden rounded-md ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                className
              )}
            />
          )
        }
      >
        {children ? undefined : (
          <Image
            src={thumbnailSrc ?? src}
            alt={alt}
            className="rounded-md"
          />
        )}
      </DialogTrigger>

      <DialogPortal>
        <DialogOverlay />
        {/* Close lives OUTSIDE the Popup: the Popup is translate-centered, and a
            `fixed` child of a transformed element anchors to that element, not
            the viewport — so a corner close nested inside would drift. As a
            Portal sibling it pins to the true viewport corner. A bare ghost X
            (no circle/border/shadow) — the standard lightbox affordance. */}
        <DialogClose
          aria-label="Close"
          className="fixed top-4 right-4 z-50 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <XIcon className="size-5" />
        </DialogClose>
        <DialogPrimitive.Popup
          data-slot="lightbox-content"
          className={cn(
            "fixed top-1/2 left-1/2 z-40 flex max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 outline-none",
            "duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[calc(100dvh-6rem)] w-auto max-w-full rounded-lg object-contain shadow-2xl"
          />
          {caption && (
            <p className="max-w-2xl text-center text-xs/relaxed text-muted-foreground">
              {caption}
            </p>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

export { Lightbox }
