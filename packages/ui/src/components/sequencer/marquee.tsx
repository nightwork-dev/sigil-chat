"use client"

import { useEffect, useId, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { dotGrid } from "@workspace/ui/lib/patterns"

export interface MarqueeProps {
  /** Text to scroll */
  text: string
  /** Scroll speed in pixels per second */
  speed?: number
  /** Text color (CSS color string) */
  color?: string
  /** Component height in px */
  height?: number
  className?: string
}

export function Marquee({
  text,
  speed = 30,
  color,
  height = 24,
  className,
}: MarqueeProps) {
  const id = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [textWidth, setTextWidth] = useState(0)
  const measuredRef = useRef<HTMLSpanElement>(null)

  const displayText = text + "\u2003\u2003\u2003\u2003\u2003"
  const fontSize = height * 0.55

  useEffect(() => {
    if (measuredRef.current) {
      setTextWidth(measuredRef.current.offsetWidth)
    }
  }, [text, fontSize])

  const duration = textWidth > 0 ? textWidth / speed : 10
  const animName = `marquee-${id.replace(/:/g, "")}`

  return (
    <div
      data-slot="marquee"
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-black/40",
        className,
      )}
      style={{ height }}
    >
      {/* Dot matrix background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          ...dotGrid({ radius: 0.5, spacing: 3, color: color ?? "hsl(var(--primary))" }),
          opacity: 0.04,
        }}
      />

      {/* Inline keyframes */}
      <style>{`
        @keyframes ${animName} {
          from { transform: translateX(0); }
          to { transform: translateX(-${textWidth}px); }
        }
      `}</style>

      {/* Hidden measurer */}
      <span
        ref={measuredRef}
        aria-hidden
        className="pointer-events-none invisible absolute whitespace-nowrap font-mono font-bold"
        style={{ fontSize }}
      >
        {displayText}
      </span>

      {/* Scrolling text */}
      <div
        className="absolute top-0 left-0 flex h-full items-center whitespace-nowrap"
        style={{
          animation: textWidth > 0 ? `${animName} ${duration}s linear infinite` : undefined,
        }}
      >
        {/* Two copies for seamless loop */}
        {[0, 1].map((i) => (
          <span
            key={i}
            className="whitespace-nowrap font-mono font-bold"
            style={{
              fontSize,
              color: color ?? "hsl(var(--primary))",
              textShadow: `0 0 6px ${color ?? "hsl(var(--primary))"}66`,
            }}
          >
            {displayText}
          </span>
        ))}
      </div>
    </div>
  )
}
