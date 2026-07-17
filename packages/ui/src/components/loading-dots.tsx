import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"

// Three dots with a staggered pulse — the "assistant is composing" /
// generic inline-loading indicator. Flat: three identically-styled dots,
// no independent parts.

const dotVariants = cva("animate-staggered-pulse rounded-full bg-current", {
  variants: {
    size: {
      sm: "size-1",
      default: "size-1.5",
      lg: "size-2",
    },
  },
  defaultVariants: { size: "default" },
})

interface LoadingDotsProps extends VariantProps<typeof dotVariants> {
  className?: string
}

function LoadingDots({ size, className }: LoadingDotsProps) {
  return (
    <span
      data-slot="loading-dots"
      className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}
    >
      <span className={dotVariants({ size })} style={{ animationDelay: "0ms" }} />
      <span className={dotVariants({ size })} style={{ animationDelay: "160ms" }} />
      <span className={dotVariants({ size })} style={{ animationDelay: "320ms" }} />
    </span>
  )
}

export { LoadingDots }
export type { LoadingDotsProps }
