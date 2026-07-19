import {
  useCallback,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Textarea } from "@workspace/ui/components/textarea"
import { useFileUpload } from "@workspace/ui/hooks/use-file-upload"
import { useClipboard } from "@workspace/ui/hooks/use-clipboard"
import { isImageUrl } from "@workspace/ui/lib/image-url"
import { FileIcon, PaperclipIcon, SendIcon, SquareIcon, XIcon } from "lucide-react"

/** Default `accept` for the attachment picker: images, PDFs, and the common
 *  document/data formats users paste into a chat (markdown, text, CSV/TSV,
 *  Excel, Word, JSON). Broad on purpose — the upload path is content-agnostic;
 *  what a given model can actually *read* is a separate concern from what a user
 *  may attach. Pass the `accept` prop to narrow it. */
const DEFAULT_ATTACHMENT_ACCEPT = [
  "image/*",
  "application/pdf",
  "text/plain",
  "text/markdown",
  ".md",
  ".markdown",
  "text/csv",
  ".csv",
  "text/tab-separated-values",
  ".tsv",
  "application/json",
  ".json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls",
  ".xlsx",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc",
  ".docx",
].join(",")

/** One attached file, from selection through upload to a served URL. */
export interface ChatInputAttachment {
  readonly id: string
  readonly filename: string
  readonly mediaType: string
  /** `undefined` while the upload is in flight. */
  readonly url?: string
  readonly status: "uploading" | "uploaded" | "error"
  readonly errorMessage?: string
}

/**
 * Chat compose bar with textarea, send button, and an optional file-attach
 * affordance.
 *
 * Keyboard: Enter sends (unless Shift held). Shift+Enter adds newline.
 * When streaming, the send button becomes a stop button.
 *
 * Uses @workspace/ui Textarea — the chat-specific overrides (no visible
 * border, minimal padding) are applied via className.
 *
 * Attachments are opt-in: pass `onAttach` to show the paperclip button and
 * `attachments` to render preview chips above the textarea. Callers that
 * don't need attachments (demo/showcase chat surfaces) can omit both and
 * get the previous plain compose bar.
 *
 * Ingestion (drag-drop / paste / pick) is delegated to the `useFileUpload` and
 * `useClipboard` cores: when `onAttach`
 * is set the whole bar is a dropzone and pasting image files attaches them;
 * when `onAttachUrl` is set, pasting a bare image URL attaches it by reference
 * instead of dropping the link into the text. Any other paste is untouched. The
 * parent owns the upload queue (via `useAttachments`); this component only
 * surfaces the files/URLs the user offered.
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
  attachments,
  onAttach,
  onAttachUrl,
  onRemoveAttachment,
  accept,
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
  attachments?: readonly ChatInputAttachment[]
  onAttach?: (files: readonly File[]) => void
  /** Attach an image by URL (e.g. a pasted image link). */
  onAttachUrl?: (url: string) => void
  onRemoveAttachment?: (id: string) => void
  /** `accept` attribute for the file picker. Defaults to a broad set covering
   *  images, PDFs, and common document/data formats (md, csv, xlsx, …). */
  accept?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const acceptTypes = accept ?? DEFAULT_ATTACHMENT_ACCEPT
  const attachEnabled = Boolean(onAttach) && !disabled
  // A message with only an attachment and no typed text is still sendable —
  // don't gate purely on `value.trim()`.
  const hasSendableAttachment = (attachments?.length ?? 0) > 0
  const canSend = value.trim().length > 0 || hasSendableAttachment

  // Ingestion cores. useFileUpload handles drag-drop, the picker, and pasted
  // files; useClipboard handles a pasted image URL. The parent's onAttach /
  // onAttachUrl receive what the user offered.
  const fileUpload = useFileUpload({
    accept: acceptTypes,
    disabled: !onAttach || disabled,
    onFiles: (files) => onAttach?.(files),
  })
  const urlClipboard = useClipboard<string>({
    parse: (payload) => {
      if (!onAttachUrl) return undefined
      const text = payload.text.trim()
      return isImageUrl(text) ? text : undefined
    },
    onPaste: (url) => onAttachUrl?.(url),
  })

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (!isStreaming && canSend) {
          onSend()
        }
      }
    },
    [isStreaming, canSend, onSend],
  )

  const handleSendClick = useCallback(() => {
    if (isStreaming) {
      onStop?.()
    } else if (canSend) {
      onSend()
      textareaRef.current?.focus()
    }
  }, [isStreaming, canSend, onSend, onStop])

  // Route a paste to the file core first (screenshots / copied images); if it
  // didn't consume the event, offer it to the URL core (a pasted image link).
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      fileUpload.onPaste(e)
      if (!e.defaultPrevented) urlClipboard.onPaste(e)
    },
    [fileUpload, urlClipboard],
  )

  return (
    <div
      className={cn("relative border-t border-border", className)}
      {...(attachEnabled ? fileUpload.getRootProps() : {})}
    >
      {attachEnabled ? <input {...fileUpload.getInputProps()} /> : null}
      {attachEnabled && fileUpload.isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary/60 bg-background/80 text-sm font-medium text-primary">
          Drop files to attach
        </div>
      ) : null}
      {attachments && attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((attachment) => (
            <AttachmentChip
              attachment={attachment}
              key={attachment.id}
              onRemove={onRemoveAttachment}
            />
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2 p-3">
        {onAttach ? (
          <button
            aria-label="Attach a file"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
              "disabled:opacity-30 disabled:cursor-default",
              actionClassName,
            )}
            disabled={disabled}
            onClick={fileUpload.open}
            title="Attach a file"
            type="button"
          >
            <PaperclipIcon className="size-3.5" />
          </button>
        ) : null}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onAttach || onAttachUrl ? handlePaste : undefined}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-0 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-0 focus-visible:ring-0 max-sm:min-h-11 dark:bg-transparent"
        />
        <button
          aria-label={isStreaming ? "Stop response" : "Send message"}
          type="button"
          onClick={handleSendClick}
          disabled={disabled || (!isStreaming && !canSend)}
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
    </div>
  )
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ChatInputAttachment
  onRemove?: (id: string) => void
}) {
  const isImage =
    attachment.mediaType.startsWith("image/") && attachment.status === "uploaded"

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border bg-muted/40 py-1 pl-1.5 pr-1 text-xs",
        attachment.status === "error" && "border-destructive/50 text-destructive",
      )}
    >
      {isImage && attachment.url ? (
        <img
          alt=""
          className="size-5 shrink-0 rounded object-cover"
          src={attachment.url}
        />
      ) : (
        <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="max-w-32 truncate">{attachment.filename}</span>
      {attachment.status === "uploading" ? (
        <span className="text-muted-foreground">uploading…</span>
      ) : null}
      {attachment.status === "error" ? (
        <span title={attachment.errorMessage}>failed</span>
      ) : null}
      {onRemove ? (
        <button
          aria-label={`Remove ${attachment.filename}`}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onRemove(attachment.id)}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
