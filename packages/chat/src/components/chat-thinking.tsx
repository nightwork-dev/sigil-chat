import { useState, useEffect } from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Collapsible thinking/reasoning block for assistant messages.
 * Auto-opens when streaming produces thinking content.
 * Shows token estimate when complete.
 */
export function ChatThinking({
  content,
  isStreaming,
  className,
}: {
  content: string
  isStreaming?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(isStreaming ?? false)

  useEffect(() => {
    if (isStreaming && content.trim()) setOpen(true)
  }, [isStreaming, content])

  if (!content.trim()) return null

  const tokenEstimate = content.split(/\s+/).filter(Boolean).length

  return (
    <div className={cn("mb-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-mono text-primary/70 hover:text-primary transition-colors cursor-pointer"
      >
        <span>{open ? "\u25BE" : "\u25B8"}</span>
        <span>
          Thinking{isStreaming ? "..." : ""}{" "}
          {!isStreaming && (
            <span className="text-muted-foreground">
              ({tokenEstimate} tokens)
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="mt-1 max-h-60 overflow-y-auto border-l-2 border-primary/30 bg-background pl-3 py-2 text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  )
}
