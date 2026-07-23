import { useState } from "react"
import { ChevronRightIcon, FileIcon } from "lucide-react"

import type {
  AgentMessage,
  AgentMessagePart,
  AgentToolInputResponse,
} from "@zigil/agent-surface/contracts"
import { ChatImage } from "@workspace/chat/components/chat-image"
import { ChatMessage } from "@workspace/chat/components/chat-message"
import { Card } from "@workspace/ui/components/card"
import { ToolCallSlot } from "@workspace/ui/components/tool-renderer-registry"
import { cn } from "@workspace/ui/lib/utils"

import { AuthorizationCard } from "@/components/agent/authorization-card"

export function AgentTranscriptMessage({
  canRespond,
  isStreaming,
  message,
  onAlwaysAllow,
  onInputResponses,
}: {
  canRespond: boolean
  isStreaming: boolean
  message: AgentMessage
  onAlwaysAllow?: () => void
  onInputResponses: (
    responses: readonly AgentToolInputResponse[],
  ) => void | Promise<void>
}) {
  const attachmentTexts: Array<{ filename: string; body: string }> = []
  const text = message.parts
    .filter(
      (part): part is Extract<AgentMessagePart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => {
      const attachment = parseTextAttachment(part.text)
      if (attachment) {
        attachmentTexts.push(attachment)
        return ""
      }
      return part.text
    })
    .join("")
  const thinking = message.parts
    .filter(
      (part): part is Extract<AgentMessagePart, { type: "reasoning" }> =>
        part.type === "reasoning",
    )
    .map((part) => part.text)
    .join("")
  const fileParts = message.parts.filter(
    (part): part is Extract<AgentMessagePart, { type: "file" }> =>
      part.type === "file",
  )
  const otherParts = message.parts.filter(
    (part) =>
      part.type !== "text" && part.type !== "reasoning" && part.type !== "file",
  )

  return (
    <div className="min-w-0 max-w-full">
      {text || thinking ? (
        <ChatMessage
          content={text}
          isStreaming={isStreaming}
          role={message.role}
          thinking={thinking || undefined}
        />
      ) : null}
      {fileParts.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          {fileParts.map((part, index) => (
            <AttachmentPreview
              filename={part.filename}
              key={`file:${index}`}
              mediaType={part.mediaType}
              size={fileParts.length > 1 ? "grid" : "default"}
              url={part.url}
            />
          ))}
        </div>
      ) : null}
      {attachmentTexts.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {attachmentTexts.map((attachment, index) => (
            <AttachmentTextChip
              body={attachment.body}
              filename={attachment.filename}
              key={`att-text:${index}`}
            />
          ))}
        </div>
      ) : null}
      {otherParts.length > 0 ? (
        <div className="mt-2 min-w-0 max-w-full space-y-2 border-l-2 border-muted-foreground/20 pl-3">
          {otherParts.map((part, index) => (
            <AgentPart
              canRespond={canRespond}
              key={
                part.type === "tool-call" ? part.id : `${part.type}:${index}`
              }
              onAlwaysAllow={onAlwaysAllow}
              onInputResponses={onInputResponses}
              part={part}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AgentPart({
  canRespond,
  onAlwaysAllow,
  onInputResponses,
  part,
}: {
  canRespond: boolean
  onAlwaysAllow?: () => void
  onInputResponses: (
    responses: readonly AgentToolInputResponse[],
  ) => void | Promise<void>
  part: Exclude<AgentMessagePart, { type: "text" | "reasoning" }>
}) {
  if (part.type === "tool-call") {
    return (
      <ToolCallSlot
        canRespond={canRespond}
        onAlwaysAllow={onAlwaysAllow}
        onInputResponses={onInputResponses}
        part={part}
      />
    )
  }

  if (part.type === "authorization") {
    return <AuthorizationCard part={part} />
  }

  if (part.type === "file") {
    return (
      <AttachmentPreview
        filename={part.filename}
        mediaType={part.mediaType}
        url={part.url}
      />
    )
  }

  return null
}

function AttachmentPreview({
  filename,
  mediaType,
  size,
  url,
}: {
  filename?: string
  mediaType: string
  size?: "default" | "grid"
  url?: string
}) {
  if (mediaType.startsWith("image/") && url) {
    return <ChatImage alt={filename} size={size} url={url} />
  }
  return (
    <Card className="flex items-center gap-2 p-3" size="sm">
      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{filename ?? mediaType}</span>
    </Card>
  )
}

const TEXT_ATTACHMENT_PATTERN =
  /^Attached file: ([^\n]+)\n\n```\n([\s\S]*)\n```$/

export function parseTextAttachment(
  value: string,
): { filename: string; body: string } | null {
  const match = TEXT_ATTACHMENT_PATTERN.exec(value)
  if (!match) return null
  return { filename: match[1], body: match[2] }
}

function AttachmentTextChip({
  body,
  filename,
}: {
  body: string
  filename: string
}) {
  const [open, setOpen] = useState(false)
  const lineCount = body.split("\n").length

  return (
    <Card className="min-w-0 max-w-full overflow-hidden p-0" size="sm">
      <button
        className="flex w-full items-center gap-2 p-3 text-left"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{filename}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <pre className="max-h-80 overflow-auto border-t border-border bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap break-words">
          {body}
        </pre>
      ) : null}
    </Card>
  )
}
