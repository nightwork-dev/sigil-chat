import { cn } from "@workspace/ui/lib/utils"

// Breathing/blinking text cursor for streaming output — extracted from
// packages/chat/src/components/chat-message.tsx, which previously defined
// this look twice (once inline, once as its own exported component). Both
// call sites there now import this instead.

interface StreamingCursorProps {
  className?: string
}

function StreamingCursor({ className }: StreamingCursorProps) {
  return (
    <span
      data-slot="streaming-cursor"
      className={cn(
        "inline-block h-[1.1em] w-[2px] animate-breathing-blink bg-primary align-middle",
        className,
      )}
    />
  )
}

export { StreamingCursor }
export type { StreamingCursorProps }
