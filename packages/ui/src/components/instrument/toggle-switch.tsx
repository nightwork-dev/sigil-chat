"use client"

import { cn } from "@workspace/ui/lib/utils"
import {
  useThemeColors,
  withAlpha,
} from "@workspace/ui/hooks/use-theme-colors"

export interface ToggleSwitchProps {
  /** Current state */
  isOn: boolean
  /** Called when toggled */
  onToggle: (value: boolean) => void
  /** Optional label displayed to the right */
  label?: string
  /** Text for the off position (default "OFF") */
  offLabel?: string
  /** Text for the on position (default "ON") */
  onLabel?: string
  /** Channel width in pixels (default 52) */
  width?: number
  className?: string
}

export function ToggleSwitch({
  isOn,
  onToggle,
  label,
  offLabel = "OFF",
  onLabel: onText = "ON",
  width = 52,
  className,
}: ToggleSwitchProps) {
  const tc = useThemeColors()
  const height = 20
  const indicatorWidth = 6

  return (
    <div
      data-slot="toggle-switch"
      className={cn("inline-flex items-center gap-2", className)}
    >
      {/* Channel with sliding indicator */}
      <button
        type="button"
        className="relative cursor-pointer rounded-[3px] border-none p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        style={{ width, height }}
        onClick={() => onToggle(!isOn)}
      >
        {/* Channel depression */}
        <div
          className="absolute inset-0 rounded-[3px]"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            boxShadow: `inset 0 0.5px 1px rgba(0, 0, 0, 0.2), 0 0 0 0.5px ${withAlpha(tc.border, 0.6)}`,
          }}
        />

        {/* Active side fill */}
        <div className="absolute inset-[1.5px] flex">
          {isOn ? (
            <>
              <div
                className="flex-1 rounded-sm"
                style={{
                  backgroundColor: withAlpha(tc.primary, 0.15),
                }}
              />
              <div className="flex-1" />
            </>
          ) : (
            <>
              <div className="flex-1" />
              <div
                className="flex-1 rounded-sm"
                style={{
                  backgroundColor: withAlpha(tc.muted, 0.3),
                }}
              />
            </>
          )}
        </div>

        {/* State labels */}
        <div className="absolute inset-0 flex items-center px-0.5">
          <span
            className="flex-1 text-center font-mono font-semibold tracking-[0.5px] transition-opacity"
            style={{
              fontSize: 7,
              color: isOn
                ? withAlpha(tc.mutedForeground, 0.3)
                : tc.mutedForeground,
            }}
          >
            {offLabel}
          </span>
          <span
            className="flex-1 text-center font-mono font-semibold tracking-[0.5px] transition-opacity"
            style={{
              fontSize: 7,
              color: isOn
                ? tc.primary
                : withAlpha(tc.mutedForeground, 0.3),
            }}
          >
            {onText}
          </span>
        </div>

        {/* Position indicator */}
        <div
          className="absolute top-[2px] transition-all duration-150"
          style={{
            width: indicatorWidth,
            height: height - 4,
            borderRadius: 2,
            backgroundColor: isOn
              ? tc.primary
              : withAlpha(tc.mutedForeground, 0.4),
            left: isOn ? width - indicatorWidth - 2 : 2,
          }}
        />
      </button>

      {label && (
        <span className="font-mono text-[10px] tracking-wider uppercase text-foreground">
          {label}
        </span>
      )}
    </div>
  )
}
