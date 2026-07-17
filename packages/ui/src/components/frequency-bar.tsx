import { cn } from "@workspace/ui/lib/utils"

/**
 * CSS-only data visualization — background width proportional to value/max.
 * Zero dependency. The bar IS the background of the content.
 *
 * Usage:
 *   <FrequencyBar value={count} max={maxCount}>
 *     <span>{item.name}</span>
 *     <span className="ml-auto font-mono">{count}</span>
 *   </FrequencyBar>
 */
function FrequencyBar({
  value,
  max,
  color = "var(--color-primary)",
  children,
  className,
}: {
  /** Current value */
  value: number
  /** Maximum value (determines 100% width) */
  max: number
  /** Bar color — CSS value. Default: primary token. */
  color?: string
  children: React.ReactNode
  className?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      data-slot="frequency-bar"
      className={cn(
        "relative flex items-center gap-2 px-2 py-1 text-xs rounded",
        className,
      )}
    >
      <div
        className="absolute inset-0 rounded opacity-10"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      <div className="relative flex-1 flex items-center gap-2 min-w-0">
        {children}
      </div>
    </div>
  )
}

export { FrequencyBar }
