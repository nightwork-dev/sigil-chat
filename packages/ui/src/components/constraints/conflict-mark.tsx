// Wraps a value with a diagonal strikethrough + destructive border when it
// conflicts with something else (an over-constrained pin, a validation
// failure) — the value still shows, it just reads as "asserted but invalid"
// rather than disappearing behind a bare error state.

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { cn } from "@workspace/ui/lib/utils"

interface ConflictMarkProps extends useRender.ComponentProps<"span"> {
  conflicting: boolean
  /** Marks this as the origin of the conflict (vs. downstream fallout) with a small danger dot. */
  isOrigin?: boolean
}

function ConflictMark({ conflicting, isOrigin = false, children, className, render, ...props }: ConflictMarkProps) {
  const content = conflicting ? (
    <>
      {isOrigin && <StatusDot status="danger" size="sm" />}
      <span className="relative inline-flex items-center rounded-sm border border-destructive/40 px-1">
        <span className="relative">
          {children}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),var(--color-destructive)_calc(50%-0.5px),var(--color-destructive)_calc(50%+0.5px),transparent_calc(50%+0.5px))] opacity-60"
          />
        </span>
      </span>
    </>
  ) : (
    children
  )

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(conflicting && "inline-flex items-center gap-1.5", className),
        children: content,
      },
      props
    ),
    render,
    state: { slot: "conflict-mark", conflicting },
  })
}

export { ConflictMark }
export type { ConflictMarkProps }
