import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

/**
 * Standard row for data lists — the atomic unit of every list in every project.
 * Label + value + optional status + hover-visible actions.
 *
 * The `group` class enables child hover effects (e.g. action buttons
 * with `opacity-0 group-hover:opacity-100`).
 */

const itemRowVariants = cva("flex items-center gap-2 group", {
  variants: {
    size: {
      sm: "py-0.5 text-[10px]",
      md: "py-1 text-xs",
      lg: "py-1.5 text-sm",
    },
  },
  defaultVariants: { size: "md" },
})

function ItemRow({
  children,
  actions,
  size,
  className,
}: {
  children: ReactNode
  /** Hover-visible actions (buttons, icons). Appears on right. */
  actions?: ReactNode
  className?: string
} & VariantProps<typeof itemRowVariants>) {
  return (
    <div
      data-slot="item-row"
      className={cn(itemRowVariants({ size }), className)}
    >
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {children}
      </div>
      {actions && (
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  )
}

/**
 * Small icon button for ItemRow actions.
 * Hover-visible — pair with ItemRow's `actions` slot.
 */
const actionButtonVariants = cva(
  "size-5 flex items-center justify-center rounded transition-colors cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "text-muted-foreground hover:text-foreground hover:bg-muted",
        danger:
          "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
        warning:
          "text-muted-foreground hover:text-warning hover:bg-warning/10",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

function ActionButton({
  children,
  variant,
  onClick,
  title,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  title?: string
  className?: string
} & VariantProps<typeof actionButtonVariants>) {
  return (
    <button
      type="button"
      className={cn(actionButtonVariants({ variant }), className)}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

export { ItemRow, ActionButton, itemRowVariants, actionButtonVariants }
