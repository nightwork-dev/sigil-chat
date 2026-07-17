import { useRef, useCallback, type KeyboardEvent } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Textarea } from "@workspace/ui/components/textarea"
import { SendIcon, SquareIcon } from "lucide-react"

/**
 * Chat compose bar with textarea and send button.
 *
 * Keyboard: Enter sends (unless Shift held). Shift+Enter adds newline.
 * When streaming, the send button becomes a stop button.
 *
 * Uses @workspace/ui Textarea — the chat-specific overrides (no visible
 * border, minimal padding) are applied via className.
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  placeholder = "Send a message...",
  disabled,
  className,
  actionClassName,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  isStreaming?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
  actionClassName?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (!isStreaming && value.trim()) {
          onSend()
        }
      }
    },
    [isStreaming, value, onSend],
  )

  const handleSendClick = useCallback(() => {
    if (isStreaming) {
      onStop?.()
    } else if (value.trim()) {
      onSend()
      textareaRef.current?.focus()
    }
  }, [isStreaming, value, onSend, onStop])

  return (
    <div
      className={cn(
        "flex items-end gap-2 border-t border-border p-3",
        className,
      )}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-0 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-0 focus-visible:ring-0 max-sm:min-h-11 dark:bg-transparent"
      />
      <button
        aria-label={isStreaming ? "Stop response" : "Send message"}
        type="button"
        onClick={handleSendClick}
        disabled={disabled || (!isStreaming && !value.trim())}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          isStreaming
            ? "text-destructive hover:bg-destructive/10"
            : "text-muted-foreground hover:text-primary hover:bg-primary/10",
          "disabled:opacity-30 disabled:cursor-default",
          actionClassName,
        )}
      >
        {isStreaming ? (
          <SquareIcon className="size-3.5" />
        ) : (
          <SendIcon className="size-3.5" />
        )}
      </button>
    </div>
  )
}
