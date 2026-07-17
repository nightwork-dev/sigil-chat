import { type ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { StreamingCursor } from "@workspace/ui/components/streaming-cursor";
import { ChatMarkdown } from "@workspace/chat/components/chat-markdown";
import { ChatThinking } from "@workspace/chat/components/chat-thinking";

/**
 * A single chat message with role-aware styling.
 *
 * Renders user messages as plain text, assistant messages as markdown.
 * Includes optional thinking block, streaming cursor, and action slot.
 *
 * Layout: left border (role-colored) + content area.
 * Not bubble-style — this is the instrument register, not iMessage.
 */
export function ChatMessage({
  role,
  content,
  thinking,
  isStreaming,
  roleLabel,
  timestamp,
  actions,
  className,
}: {
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  isStreaming?: boolean;
  /** Override the role label. Default: "you" for user, "assistant" for assistant. */
  roleLabel?: string;
  timestamp?: string;
  /** Slot for action buttons (reroll, continue, delete, swipe controls) */
  actions?: ReactNode;
  className?: string;
}) {
  const isUser = role === "user";
  const label = roleLabel ?? (isUser ? "you" : "assistant");

  return (
    <div
      className={cn("group/msg min-w-0 max-w-full animate-fade-in", className)}
    >
      {/* Role label + timestamp + actions */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-wider",
            isUser ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        <div className="flex items-center gap-1">
          {actions}
          {timestamp && (
            <span className="text-[10px] font-mono text-muted-foreground/60">
              {timestamp}
            </span>
          )}
        </div>
      </div>

      {/* Content with role-colored left border */}
      <div
        className={cn(
          "min-w-0 max-w-full border-l-2 py-1 pl-3",
          isUser ? "border-primary/50" : "border-muted-foreground/20",
        )}
      >
        {/* Thinking block (assistant only) */}
        {!isUser && thinking && (
          <ChatThinking content={thinking} isStreaming={isStreaming} />
        )}

        {/* Message content */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
            {content}
          </p>
        ) : (
          <>
            <ChatMarkdown content={content} />
            {isStreaming && <StreamingCursor className="ml-0.5" />}
          </>
        )}
      </div>
    </div>
  );
}

// Re-exported for existing consumers (e.g. examples/chat.tsx) that import
// StreamingCursor from this module — the actual implementation now lives in
// @workspace/ui/components/streaming-cursor, shared with the showcase.
export { StreamingCursor };
