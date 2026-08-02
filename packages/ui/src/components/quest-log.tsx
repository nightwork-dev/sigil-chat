"use client"

// QuestLog — a popover panel for a standing checklist: what you are working
// toward, how far along you are, and the individual things still open.
//
// Extracted from the tutorial quest panel in sigil-game, where it taught a
// player what a room could carry. The shape turned out to have nothing to do
// with games: a small pile of independently-completable items, each with a
// title, an explanation, and sometimes one action that advances it, behind a
// trigger that carries the count. An onboarding checklist, a release
// readiness list, a review queue, and a setup wizard's remaining steps are
// all the same panel.
//
// Root holds the counts so the trigger's badge, the progress bar, and the
// caller's own copy cannot disagree — the source had `completedCount` read in
// three places and nothing keeping them honest.
//
// Not Stepper, and not Item. Stepper is a numeric +/- control — different
// purpose entirely. Item is the closer sibling and was tried: its title
// line-clamps to one line, its description to two, and it centers its media,
// while a quest entry needs a full multi-line explanation under a
// top-aligned status icon. Composing it would have meant overriding
// alignment, gap, and both clamps on every part, which is fighting a stock
// shadcn primitive rather than reusing it.

import type { ComponentProps, ReactNode } from "react"
import { createContext, useContext } from "react"
import { CircleCheckIcon, CircleIcon, ListChecksIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Completion as a percentage, or `null` when there is nothing to complete.
 *
 * Null rather than 0 or 100 because an empty log has no honest answer: 0%
 * reads as "none done yet" and 100% as "all done", and neither is true of a
 * list with no entries. Callers render an indeterminate or absent bar.
 * Out-of-range counts are clamped rather than trusted — `completed` arrives
 * from a caller's own filtering and can legitimately exceed `total` for a
 * frame while data is in flight.
 */
export function questLogProgress(
  completed: number,
  total: number,
): number | null {
  if (!Number.isFinite(total) || total <= 0) return null
  const done = Math.min(Math.max(completed, 0), total)
  return Math.round((done / total) * 100)
}

interface QuestLogContextValue {
  completed: number
  total: number
  /** 0–100, or null for an empty log. See {@link questLogProgress}. */
  progress: number | null
}

const QuestLogContext = createContext<QuestLogContextValue | null>(null)

function useQuestLog(): QuestLogContextValue {
  const context = useContext(QuestLogContext)
  if (!context) {
    throw new Error("QuestLog parts must be used inside <QuestLog.Root>.")
  }
  return context
}

interface QuestLogRootProps {
  /** How many entries are done. Clamped into [0, total] for display. */
  completed: number
  /** How many entries there are. Zero is a legitimate, empty log. */
  total: number
  children: ReactNode
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

function Root({
  children,
  completed,
  defaultOpen,
  onOpenChange,
  open,
  total,
}: QuestLogRootProps) {
  return (
    <QuestLogContext.Provider
      value={{ completed, total, progress: questLogProgress(completed, total) }}
    >
      <Popover
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        open={open}
      >
        {children}
      </Popover>
    </QuestLogContext.Provider>
  )
}

type QuestLogTriggerProps = Omit<ComponentProps<typeof Button>, "children"> & {
  /** Trigger text. Defaults to "Quest log". */
  children?: ReactNode
  /** Leading icon, or `null` for none. Defaults to a checklist glyph. */
  icon?: ReactNode
  /**
   * Accessible label. Defaults to the visible text plus the count, which is
   * what a screen reader needs — the bare "3/7" beside it is decoration
   * without the sentence around it.
   */
  "aria-label"?: string
}

function Trigger({
  children = "Quest log",
  className,
  icon,
  size = "sm",
  variant = "outline",
  "aria-label": ariaLabel,
  ...props
}: QuestLogTriggerProps) {
  const { completed, total } = useQuestLog()
  const label =
    ariaLabel ??
    (typeof children === "string"
      ? `${children}, ${completed} of ${total} complete`
      : undefined)

  return (
    <PopoverTrigger
      render={
        <Button
          aria-label={label}
          className={cn("shrink-0 max-sm:min-h-11", className)}
          size={size}
          variant={variant}
          {...props}
        />
      }
    >
      {icon === undefined ? <ListChecksIcon aria-hidden="true" /> : icon}
      {children}
      <span
        aria-hidden="true"
        className="font-mono text-[0.7rem] text-muted-foreground"
      >
        {completed}/{total}
      </span>
    </PopoverTrigger>
  )
}

interface QuestLogPanelProps extends Omit<
  ComponentProps<typeof PopoverContent>,
  "title"
> {
  description?: ReactNode
  title?: ReactNode
}

/**
 * The panel body. Separate from Root because the trigger and the content are
 * siblings inside a Popover — Root cannot render the content without
 * swallowing the composition the parts exist to allow.
 */
function Panel({
  align = "end",
  children,
  className,
  description,
  side = "bottom",
  sideOffset = 8,
  title = "Quest log",
  ...props
}: QuestLogPanelProps) {
  return (
    <PopoverContent
      align={align}
      className={cn(
        "max-h-[min(38rem,calc(100svh-8rem))] w-[min(27rem,calc(100vw-2rem))] gap-0 overflow-y-auto overscroll-contain rounded-sm p-0",
        className,
      )}
      initialFocus={false}
      side={side}
      sideOffset={sideOffset}
      {...props}
    >
      {title || description ? (
        <PopoverHeader className="border-b border-border px-5 py-4 pr-10">
          {title ? <PopoverTitle>{title}</PopoverTitle> : null}
          {description ? (
            <PopoverDescription>{description}</PopoverDescription>
          ) : null}
        </PopoverHeader>
      ) : null}
      {children}
    </PopoverContent>
  )
}

interface QuestLogObjectiveProps extends Omit<
  ComponentProps<"section">,
  "title"
> {
  description?: ReactNode
  /** Leading glyph, or `null` for none. Callers pass their own domain icon. */
  icon?: ReactNode
  title: ReactNode
}

/** The one thing the whole log is in service of, above the individual entries. */
function Objective({
  className,
  description,
  icon,
  title,
  ...props
}: QuestLogObjectiveProps) {
  return (
    <section
      data-slot="quest-log-objective"
      className={cn("border-b border-border px-5 py-4", className)}
      {...props}
    >
      <div className="flex gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="font-medium text-foreground">{title}</p>
          {description ? (
            <div
              data-slot="quest-log-objective-description"
              className="mt-1 text-sm leading-6 text-muted-foreground"
            >
              {description}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

interface QuestLogProgressProps extends ComponentProps<"section"> {
  /** What the bar is measuring, e.g. "Learning the room". */
  label: ReactNode
  /**
   * Readout beside the label. Defaults to "N of M"; pass a node to say it
   * differently, or `null` to show the bar with no readout.
   */
  value?: ReactNode
}

function ProgressSection({
  className,
  label,
  value,
  ...props
}: QuestLogProgressProps) {
  const { completed, progress, total } = useQuestLog()
  return (
    <section
      data-slot="quest-log-progress"
      className={cn("border-b border-border px-5 py-4", className)}
      {...props}
    >
      {/* An empty log gets an indeterminate track rather than a bar sitting
          at 0% or 100%, neither of which is true of "nothing to do". */}
      <Progress value={progress}>
        <ProgressLabel>{label}</ProgressLabel>
        {value === null ? null : (
          <ProgressValue>
            {() => value ?? `${Math.min(completed, total)} of ${total}`}
          </ProgressValue>
        )}
      </Progress>
    </section>
  )
}

/** The ordered list of entries. Give it an `aria-label` naming what they are. */
function Entries({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      data-slot="quest-log-entries"
      className={cn("divide-y divide-border", className)}
      {...props}
    />
  )
}

interface QuestLogEntryProps extends Omit<ComponentProps<"li">, "title"> {
  /**
   * One action that advances this entry — a link, a button, a form. Rendered
   * under the description. Callers decide whether a completed entry still
   * offers one.
   */
  action?: ReactNode
  complete?: boolean
  description?: ReactNode
  /**
   * Status glyph. Defaults to a filled check when complete and an empty
   * circle otherwise; pass a node for a third state (blocked, in flight)
   * that a boolean cannot express.
   */
  icon?: ReactNode
  title: ReactNode
}

function Entry({
  action,
  className,
  complete = false,
  description,
  icon,
  title,
  ...props
}: QuestLogEntryProps) {
  const StatusIcon = complete ? CircleCheckIcon : CircleIcon
  return (
    <li
      data-complete={complete || undefined}
      data-slot="quest-log-entry"
      className={cn("flex gap-3 px-5 py-4", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 shrink-0 [&>svg]:size-4",
          complete ? "text-primary" : "text-muted-foreground",
        )}
      >
        {icon ?? <StatusIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            // Open entries sit slightly back from done ones: the list reads
            // as a record of what happened, not a wall of equal shouting.
            complete ? "text-foreground" : "text-foreground/85",
          )}
        >
          {title}
        </p>
        {description ? (
          <div
            data-slot="quest-log-entry-description"
            className="mt-1 text-sm leading-6 text-muted-foreground"
          >
            {description}
          </div>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </li>
  )
}

/** A closing note under the entries — what the checkmarks do and don't mean. */
function Footnote({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="quest-log-footnote"
      className={cn(
        "border-t border-border px-5 py-4 text-xs leading-5 text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export const QuestLog = {
  Root,
  Trigger,
  Panel,
  Objective,
  Progress: ProgressSection,
  Entries,
  Entry,
  Footnote,
}

export { useQuestLog }
export type {
  QuestLogContextValue,
  QuestLogEntryProps,
  QuestLogObjectiveProps,
  QuestLogPanelProps,
  QuestLogProgressProps,
  QuestLogRootProps,
  QuestLogTriggerProps,
}
