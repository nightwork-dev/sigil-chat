import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"
import {
  normalizeTone,
  toneDotVariants,
  tonePingVariants,
  type ToneLike,
} from "@workspace/ui/lib/tone"

const statusDotVariants = cva("rounded-full shrink-0", {
  variants: {
    size: {
      sm: "size-1.5",
      md: "size-2",
      lg: "size-2.5",
    },
    pulse: {
      false: "",
      pulse: "animate-pulse",
    },
  },
  defaultVariants: { size: "md", pulse: false },
})

export type StatusDotProps = Omit<
  VariantProps<typeof statusDotVariants>,
  "pulse"
> & {
  /** Canonical tone (success/warning/destructive/info/muted/primary) or a common alias (active/danger/…). */
  status?: ToneLike
  /**
   * `"pulse"` applies an `animate-pulse` class; `"ping"` renders an
   * absolutely-positioned `animate-ping` halo behind the dot. A literal
   * `true` is accepted for backward compatibility and means `"pulse"`.
   */
  pulse?: boolean | "pulse" | "ping"
  /** Optional muted label rendered after the dot. */
  label?: string
  className?: string
}

function StatusDot({
  size,
  status = "muted",
  pulse,
  label,
  className,
}: StatusDotProps) {
  const tone = normalizeTone(status)
  // Normalize boolean pulse for backward compatibility: true → "pulse".
  const pulseMode =
    pulse === true ? "pulse" : pulse === false || pulse == null ? false : pulse

  // Plain case: the dot itself is the root (back-compat with the original
  // bare-dot markup). No wrapper span unless we need a label or ping halo.
  if (pulseMode !== "ping" && !label) {
    return (
      <div
        data-slot="status-dot"
        className={cn(
          statusDotVariants({ size, pulse: pulseMode }),
          toneDotVariants({ tone }),
          className,
        )}
      />
    )
  }

  const dotClassName = cn(
    // The ping halo supplies the animation; the dot itself stays static.
    statusDotVariants({ size, pulse: pulseMode === "ping" ? false : pulseMode }),
    toneDotVariants({ tone }),
  )

  return (
    <span
      data-slot="status-dot"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {pulseMode === "ping" ? (
        <span className="relative inline-flex">
          <span className={dotClassName} />
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full",
              statusDotVariants({ size }),
              tonePingVariants({ tone }),
            )}
          />
        </span>
      ) : (
        <span className={dotClassName} />
      )}
      {label && (
        <span className="text-xs capitalize text-muted-foreground">
          {label}
        </span>
      )}
    </span>
  )
}

export { StatusDot, statusDotVariants }
