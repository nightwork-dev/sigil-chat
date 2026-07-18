import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

/**
 * A single image in a chat message: a size-bounded thumbnail that opens the
 * full image in a lightbox on click.
 *
 * Sizing philosophy — images in a conversation are content, not hero art. The
 * thumbnail is capped in both dimensions and `object-contain`, so a tall
 * portrait and a wide panorama both read as tidy, consistent tiles instead of
 * blowing out the message column. The real pixels are one click away.
 *
 * `size` controls the thumbnail cap. `"default"` suits a lone attachment;
 * `"grid"` is smaller, for when several images tile together in one message.
 */
export function ChatImage({
  url,
  alt,
  className,
  size = "default",
}: {
  url: string
  alt?: string
  className?: string
  /** Thumbnail footprint. "grid" is tighter, for multi-image messages. */
  size?: "default" | "grid"
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        aria-label={alt ? `View image: ${alt}` : "View image"}
        className={cn(
          "group relative block overflow-hidden rounded-lg border border-border bg-muted/30",
          "cursor-zoom-in transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <img
          alt={alt ?? "attached image"}
          className={cn(
            "block h-auto w-auto object-contain",
            size === "grid"
              ? "max-h-40 max-w-[min(100%,12rem)]"
              : "max-h-64 max-w-[min(100%,22rem)]",
          )}
          loading="lazy"
          src={url}
        />
      </DialogTrigger>
      <DialogContent
        className="max-w-[95vw] border-0 bg-transparent p-0 shadow-none sm:max-w-[85vw]"
        showCloseButton
      >
        {/* Radix requires a title for a11y; the image is the visible content. */}
        <DialogTitle className="sr-only">{alt ?? "Attached image"}</DialogTitle>
        <img
          alt={alt ?? "attached image"}
          className="mx-auto max-h-[88vh] w-auto rounded-lg object-contain"
          src={url}
        />
      </DialogContent>
    </Dialog>
  )
}
