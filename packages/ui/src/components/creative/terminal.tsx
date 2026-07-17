"use client"

import { useEffect, useRef } from "react"
import { cn } from "@workspace/ui/lib/utils"

export type TerminalSeverity = "info" | "warn" | "error"

export interface TerminalEntry {
  id: string
  message: string
  severity: TerminalSeverity
  timestamp?: string
}

export interface TerminalProps {
  entries: TerminalEntry[]
  showLineNumbers?: boolean
  maxVisibleLines?: number
  fontSize?: number
  className?: string
}

const SEVERITY_PREFIX: Record<TerminalSeverity, string> = {
  info: "INF",
  warn: "WRN",
  error: "ERR",
}

const SEVERITY_COLOR: Record<TerminalSeverity, string> = {
  info: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
}

const SEVERITY_MSG_COLOR: Record<TerminalSeverity, string> = {
  info: "text-muted-foreground/90",
  warn: "text-warning/90",
  error: "text-destructive/90",
}

function Terminal({
  entries,
  showLineNumbers = true,
  maxVisibleLines = 12,
  fontSize = 9,
  className,
}: TerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [entries.length])

  const lineHeight = fontSize + 4
  const containerHeight = maxVisibleLines * lineHeight + 8

  return (
    <div
      data-slot="terminal"
      className={cn(
        "rounded-md border border-border/60 overflow-hidden",
        className,
      )}
      style={{ backgroundColor: "#0a0a0e" }}
    >
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: containerHeight }}
      >
        <div className="py-1">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className="flex items-start gap-0 px-1.5 py-px"
              style={{ fontSize }}
            >
              {/* Line number */}
              {showLineNumbers && (
                <span
                  className="shrink-0 text-right font-mono text-muted-foreground/30 pr-1"
                  style={{ width: 24, fontSize }}
                >
                  {String(index + 1).padStart(3, " ")}
                </span>
              )}

              {/* Severity badge */}
              <span
                className={cn(
                  "shrink-0 font-mono font-bold",
                  SEVERITY_COLOR[entry.severity],
                )}
                style={{ width: 24, fontSize }}
              >
                {SEVERITY_PREFIX[entry.severity]}
              </span>

              {/* Timestamp */}
              {entry.timestamp && (
                <span
                  className="shrink-0 font-mono text-muted-foreground/50 pr-1"
                  style={{ fontSize }}
                >
                  {entry.timestamp}
                </span>
              )}

              {/* Message */}
              <span
                className={cn("font-mono break-all", SEVERITY_MSG_COLOR[entry.severity])}
                style={{ fontSize }}
              >
                {entry.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}

export { Terminal }
