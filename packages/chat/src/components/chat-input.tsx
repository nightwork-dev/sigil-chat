import {
  useCallback,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Textarea } from "@workspace/ui/components/textarea"
import { useFileUpload } from "@workspace/ui/hooks/use-file-upload"
import { useClipboard } from "@workspace/ui/hooks/use-clipboard"
import { isImageUrl } from "@workspace/ui/lib/image-url"
import {
  FileIcon,
  PaperclipIcon,
  SendIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"

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

export const CHAT_INPUT_TEXTAREA_CLASS_NAME =
  "min-h-11 resize-none border-0 bg-transparent px-3 pt-3 pb-1 text-base md:text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"

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

/** Context handed to `leadingControls` — the one thing an app-composed
 *  control row needs from the built-in file-upload core it doesn't own:
 *  a way to open the native file picker (SC.10 §9.7 step 2). */
export interface ChatInputControlsContext {
  openFilePicker: () => void
}

/**
 * Chat compose bar: one contained box, textarea on top, a single control row
 * beneath (SC.10 §9.7) — left cluster (attach/app controls), right cluster
 * (app controls, send/stop).
 *
 * Keyboard: Enter sends (unless Shift held). Shift+Enter adds newline.
 * When streaming, the send button becomes a stop button — this IS the
 * run-status display (§9.4/§9.7 revision: there is no separate status dot
 * here, the interrupt affordance and the status readout are one control).
 *
 * Uses @workspace/ui Textarea — the chat-specific overrides (no visible
 * border, minimal padding) are applied via className.
 *
 * Attachments are opt-in: pass `onAttach` to enable the file-upload core
 * (dropzone, paste, hidden input) and `attachments` to render preview chips
 * above the textarea. Without `leadingControls`, a bare paperclip button
 * exposes it directly — the plain compose bar callers (demo/showcase
 * surfaces) had before. With `leadingControls`, the app renders its own
 * left-cluster content (e.g. Sigil Chat's §9.8 Add menu) and reaches the
 * same file-upload core via the `openFilePicker` callback in
 * `ChatInputControlsContext` — one mechanism, one or the other trigger for
 * it, never both at once.
 *
 * `trailingControls` renders additional app content in the right cluster,
 * before the built-in send/stop button (e.g. a model label).
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
  leadingControls,
  trailingControls,
  onKeyDown,
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
  /** App-composed left-cluster content, rendered in place of the built-in
   *  bare attach button (SC.10 §9.7/§9.8 — e.g. the `＋` Add menu). Receives
   *  `openFilePicker` to trigger the same file-upload core the bare button
   *  would have. */
  leadingControls?: (context: ChatInputControlsContext) => ReactNode
  /** App-composed right-cluster content, rendered before the built-in
   *  send/stop button (SC.10 §9.7 — e.g. a model label). */
  trailingControls?: ReactNode
  /** Additional keydown handling layered UNDER the built-in Enter-to-send —
   *  called first; if it calls `preventDefault()`, the built-in handler
   *  still runs its own check but Enter's default textarea newline stays
   *  suppressed either way (SC.10 §9.8 — the `@` mention trigger hooks in
   *  here without forking the whole keydown pipeline). */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
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
      onKeyDown?.(e)
      if (e.key === "Enter" && !e.shiftKey && !e.defaultPrevented) {
        e.preventDefault()
        if (!isStreaming && canSend) {
          onSend()
        }
      }
    },
    [onKeyDown, isStreaming, canSend, onSend],
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

  const controlsContext: ChatInputControlsContext = {
    openFilePicker: fileUpload.open,
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
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

      {/* Top region: textarea, full width. */}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={onAttach || onAttachUrl ? handlePaste : undefined}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={CHAT_INPUT_TEXTAREA_CLASS_NAME}
      />

      {/* Bottom region: one control row, left/right clusters. */}
      <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
        <div className="flex min-w-0 items-center gap-1">
          {leadingControls ? (
            leadingControls(controlsContext)
          ) : onAttach ? (
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
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {trailingControls}
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
    attachment.mediaType.startsWith("image/") &&
    attachment.status === "uploaded"

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border bg-muted/40 py-1 pl-1.5 pr-1 text-xs",
        attachment.status === "error" &&
          "border-destructive/50 text-destructive",
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
