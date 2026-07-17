import { cn } from "@workspace/ui/lib/utils"
import {
  RefreshCwIcon,
  ArrowRightIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"

/**
 * Message action buttons — reroll, continue, delete.
 * Shown on hover over a message turn. Hidden during streaming.
 */
export function ChatMessageActions({
  isAssistant,
  isLastTurn,
  isStreaming,
  onReroll,
  onContinue,
  onDelete,
  className,
}: {
  isAssistant: boolean
  isLastTurn: boolean
  isStreaming?: boolean
  onReroll?: () => void
  onContinue?: () => void
  onDelete?: () => void
  className?: string
}) {
  if (isStreaming) return null

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity",
        className,
      )}
    >
      {isAssistant && onReroll && (
        <button
          type="button"
          onClick={onReroll}
          title="Reroll"
          className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
        >
          <RefreshCwIcon className="size-3" />
        </button>
      )}
      {isAssistant && isLastTurn && onContinue && (
        <button
          type="button"
          onClick={onContinue}
          title="Continue"
          className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowRightIcon className="size-3" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title="Delete from here"
          className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors cursor-pointer"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  )
}

/**
 * Swipe controls for navigating between sibling messages (reroll alternatives).
 * Shows "N/M" with left/right chevrons. Hidden when there's only one sibling.
 */
export function ChatSwipeControls({
  siblingCount,
  activeIndex,
  onPrev,
  onNext,
  className,
}: {
  siblingCount: number
  activeIndex: number
  onPrev: () => void
  onNext: () => void
  className?: string
}) {
  if (siblingCount <= 1) return null

  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60",
        className,
      )}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={activeIndex === 0}
        className="p-0.5 hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-default transition-colors"
      >
        <ChevronLeftIcon className="size-3" />
      </button>
      <span className="tabular-nums min-w-[3ch] text-center">
        {activeIndex + 1}/{siblingCount}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={activeIndex === siblingCount - 1}
        className="p-0.5 hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-default transition-colors"
      >
        <ChevronRightIcon className="size-3" />
      </button>
    </div>
  )
}
