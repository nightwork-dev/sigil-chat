import { createContext, useContext, type ReactNode } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BracesIcon,
  EyeOffIcon,
  Layers3Icon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import {
  addTurnContextAttachment,
  attentionHistoryKey,
  attentionSelectionKey,
  createAttentionContextPreview,
  moveTurnContextAttachment,
  removeTurnContextAttachment,
  setAttentionItemExcluded,
  setTurnContextAttachmentRetention,
  useAttentionExclusions,
  useTurnContextAttachments,
  type AttentionContextPreview,
  type ContextRetention,
  type TurnContextAttachment,
} from "@zigil/agent-react/context-draft"
import {
  setAttentionPrivacyLevel,
  useAttentionPrivacyLevel,
  type AttentionPrivacyLevel,
} from "@zigil/agent-react/context-privacy"
import type {
  AttentionActivityEvent,
  AttentionContext,
  AttentionSelection,
} from "@zigil/agent-react/attention"
import { Button } from "@workspace/ui/components/button"
import { CodeBlock } from "@workspace/ui/components/code-block"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

interface ContextTrayValue {
  attention: AttentionContext | null
  attachments: readonly TurnContextAttachment[]
  excludedKeys: readonly string[]
  preview: AttentionContextPreview | null
  privacy: AttentionPrivacyLevel
}

const ContextTrayContext = createContext<ContextTrayValue | null>(null)

function useContextTray(): ContextTrayValue {
  const value = useContext(ContextTrayContext)
  if (!value)
    throw new Error("ContextTray parts must be used inside <ContextTray.Root>.")
  return value
}

function Root({
  attention,
  children,
}: {
  attention: AttentionContext | null
  children: ReactNode
}) {
  const privacy = useAttentionPrivacyLevel()
  const excludedKeys = useAttentionExclusions()
  const attachments = useTurnContextAttachments()
  const preview =
    attention || attachments.length > 0
      ? createAttentionContextPreview(
          attention,
          privacy,
          excludedKeys,
          attachments,
        )
      : null

  return (
    <ContextTrayContext.Provider
      value={{ attention, attachments, excludedKeys, preview, privacy }}
    >
      <Popover>{children}</Popover>
    </ContextTrayContext.Provider>
  )
}

function Trigger({ className }: { className?: string }) {
  const { preview, privacy } = useContextTray()
  const label = preview
    ? `${preview.selectionCount} · ${privacy} · ~${preview.estimatedTokens} tokens`
    : `${privacy} · no context`

  return (
    <PopoverTrigger
      render={
        <Button
          aria-label="Inspect agent context"
          className={cn("max-w-52 justify-start gap-2", className)}
          size="sm"
          title="Inspect exactly what the agent will receive"
          variant="ghost"
        />
      }
    >
      <Layers3Icon className="size-3.5 shrink-0" />
      <span className="truncate font-mono text-[10px]">{label}</span>
    </PopoverTrigger>
  )
}

function Content({ className }: { className?: string }) {
  const { attachments, excludedKeys, preview, privacy } = useContextTray()

  return (
    <PopoverContent
      align="end"
      className={cn(
        "w-[min(440px,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0",
        className,
      )}
    >
      <PopoverHeader className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <PopoverTitle>Context for this turn</PopoverTitle>
            <PopoverDescription>
              Inspect or exclude application attention before sending.
            </PopoverDescription>
          </div>
          <Select
            onValueChange={(value) =>
              setAttentionPrivacyLevel(value as AttentionPrivacyLevel)
            }
            value={privacy}
          >
            <SelectTrigger aria-label="Agent context privacy" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="focused">Focused</SelectItem>
              <SelectItem value="expanded">Expanded</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preview ? (
          <>
            <p className="font-mono text-[10px] text-muted-foreground">
              {preview.summary} · {preview.byteLength} bytes · ~
              {preview.estimatedTokens} tokens estimated
            </p>
            {preview.truncatedAttachmentCount > 0 ? (
              <p className="text-xs text-destructive">
                {preview.truncatedAttachmentCount} attachment
                {preview.truncatedAttachmentCount === 1 ? "" : "s"} omitted from
                the bounded payload.
              </p>
            ) : null}
          </>
        ) : null}
      </PopoverHeader>

      <ScrollArea className="max-h-[min(64dvh,560px)]">
        {!preview ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            This surface has not shared any application attention.
          </p>
        ) : (
          <div className="space-y-4 p-4">
            <ContextSection title="Ordered selections">
              {preview.selections.length > 0 ? (
                preview.selections.map((selection, index) => (
                  <SelectionRow
                    index={index}
                    key={attentionSelectionKey(selection)}
                    selection={selection}
                  />
                ))
              ) : (
                <EmptySection>No selections will be sent.</EmptySection>
              )}
            </ContextSection>

            <Separator />

            <ContextSection title="Turn and session attachments">
              {attachments.length > 0 ? (
                attachments.map((attachment, index) => (
                  <AttachmentRow
                    attachment={attachment}
                    index={index}
                    key={attachment.id}
                    total={attachments.length}
                  />
                ))
              ) : (
                <EmptySection>
                  Add a selection above to keep it explicitly attached.
                </EmptySection>
              )}
            </ContextSection>

            <Separator />

            <ContextSection title="Recent meaningful activity">
              {preview.history.length > 0 ? (
                preview.history.map((event) => (
                  <HistoryRow event={event} key={attentionHistoryKey(event)} />
                ))
              ) : (
                <EmptySection>
                  No activity is included at this privacy level.
                </EmptySection>
              )}
            </ContextSection>

            {excludedKeys.length > 0 ? (
              <>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <EyeOffIcon className="size-3.5" />
                    {excludedKeys.length} item
                    {excludedKeys.length === 1 ? "" : "s"} excluded for this
                    turn
                  </div>
                  <Button
                    onClick={() =>
                      excludedKeys.forEach((key) =>
                        setAttentionItemExcluded(key, false),
                      )
                    }
                    size="xs"
                    variant="ghost"
                  >
                    Restore all
                  </Button>
                </div>
              </>
            ) : null}

            <Separator />

            <ContextSection
              icon={<BracesIcon className="size-3.5" />}
              title="Exact serialized preview"
            >
              <CodeBlock
                className="max-h-64 overflow-auto whitespace-pre-wrap break-all"
                code={preview.formatted}
                language="json"
              />
            </ContextSection>
          </div>
        )}
      </ScrollArea>
    </PopoverContent>
  )
}

function ContextSection({
  children,
  icon,
  title,
}: {
  children: ReactNode
  icon?: ReactNode
  title: string
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function SelectionRow({
  index,
  selection,
}: {
  index: number
  selection: AttentionSelection
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-border px-3 py-2">
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{selection.label ?? selection.id}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {selection.kind} · {selection.id}
        </p>
      </div>
      <Button
        aria-label={`Attach ${selection.label ?? selection.id} to this turn`}
        className="shrink-0"
        onClick={() => addTurnContextAttachment(selection)}
        size="icon-xs"
        title="Attach to this turn"
        variant="ghost"
      >
        <PlusIcon />
      </Button>
      <ExcludeButton
        itemKey={attentionSelectionKey(selection)}
        label={`Exclude ${selection.label ?? selection.id} from this turn`}
      />
    </div>
  )
}

function AttachmentRow({
  attachment,
  index,
  total,
}: {
  attachment: TurnContextAttachment
  index: number
  total: number
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-md border border-border px-3 py-2 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="truncate text-sm">{attachment.label}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {attachment.resource.kind} · {attachment.resource.id}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {attachment.inclusion === "automatic" ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            Automatic · first turn
          </span>
        ) : (
          <>
            <Select
              onValueChange={(value) =>
                setTurnContextAttachmentRetention(
                  attachment.id,
                  value as ContextRetention,
                )
              }
              value={attachment.retention}
            >
              <SelectTrigger
                aria-label={`Retention for ${attachment.label}`}
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="turn">This turn</SelectItem>
                <SelectItem value="session">Session</SelectItem>
              </SelectContent>
            </Select>
            <Button
              aria-label={`Move ${attachment.label} earlier`}
              disabled={index === 0}
              onClick={() => moveTurnContextAttachment(attachment.id, -1)}
              size="icon-xs"
              title="Move earlier"
              variant="ghost"
            >
              <ArrowUpIcon />
            </Button>
            <Button
              aria-label={`Move ${attachment.label} later`}
              disabled={index === total - 1}
              onClick={() => moveTurnContextAttachment(attachment.id, 1)}
              size="icon-xs"
              title="Move later"
              variant="ghost"
            >
              <ArrowDownIcon />
            </Button>
            <Button
              aria-label={`Remove ${attachment.label} from context`}
              onClick={() => removeTurnContextAttachment(attachment.id)}
              size="icon-xs"
              title="Remove attachment"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </>
        )}
      </div>
      {attachment.summary ? (
        <p className="line-clamp-2 text-xs text-muted-foreground sm:col-span-2">
          {attachment.summary}
        </p>
      ) : null}
    </div>
  )
}

function HistoryRow({ event }: { event: AttentionActivityEvent }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-1 py-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">
          {event.summary ??
            `${event.action} ${event.target.label ?? event.target.id}`}
        </p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {event.action} · {event.target.kind}
        </p>
      </div>
      <ExcludeButton
        itemKey={attentionHistoryKey(event)}
        label="Exclude this activity from this turn"
      />
    </div>
  )
}

function ExcludeButton({ itemKey, label }: { itemKey: string; label: string }) {
  return (
    <Button
      aria-label={label}
      className="shrink-0"
      onClick={() => setAttentionItemExcluded(itemKey, true)}
      size="icon-xs"
      title={label}
      variant="ghost"
    >
      <XIcon />
    </Button>
  )
}

function EmptySection({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

export const ContextTray = { Root, Trigger, Content }
