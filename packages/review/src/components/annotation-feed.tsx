"use client"

// AnnotationFeed — a domain-free, read-only stream of review annotations.
//
// The host owns persistence, filtering, and body markup. <Root> can render a
// useful default list from `annotations`, while the compound parts let callers
// build denser or more expressive rows. `renderBody` is the seam for Markdown,
// rich text, or passage previews without coupling this package to a renderer.

import { createContext, useContext, type ReactNode } from "react"
import {
  CheckIcon,
  FlagIcon,
  HelpCircleIcon,
  MessageSquareIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  toneBgVariants,
  toneTextVariants,
  type Tone,
} from "@workspace/ui/lib/tone"
import { cn } from "@workspace/ui/lib/utils"
import type {
  Annotation,
  AnnotationKind,
  AnnotationStatus,
} from "@workspace/review/lib/types"

const KIND_META: Record<
  AnnotationKind,
  { Icon: LucideIcon; label: string; tone: Tone }
> = {
  note: { Icon: MessageSquareIcon, label: "Note", tone: "muted" },
  flag: { Icon: FlagIcon, label: "Flag", tone: "warning" },
  question: { Icon: HelpCircleIcon, label: "Question", tone: "primary" },
  approval: { Icon: CheckIcon, label: "Approval", tone: "success" },
}

const STATUS_TONE: Record<AnnotationStatus, Tone> = {
  active: "primary",
  dismissed: "muted",
  converted: "success",
}

interface AnnotationFeedContextValue<TAnchor> {
  formatTimestamp: (createdMs: number) => ReactNode
  renderBody?: (
    body: string,
    annotation: Annotation<TAnchor>
  ) => ReactNode
}

const AnnotationFeedContext =
  createContext<AnnotationFeedContextValue<unknown> | null>(null)

interface AnnotationItemContextValue<TAnchor> {
  annotation: Annotation<TAnchor>
}

const AnnotationItemContext =
  createContext<AnnotationItemContextValue<unknown> | null>(null)

function useAnnotationFeed<TAnchor = unknown>() {
  const context = useContext(AnnotationFeedContext)
  if (!context) {
    throw new Error(
      "AnnotationFeed parts must render inside <AnnotationFeed.Root>"
    )
  }
  return context as AnnotationFeedContextValue<TAnchor>
}

function useAnnotationItem<TAnchor = unknown>() {
  const context = useContext(AnnotationItemContext)
  if (!context) {
    throw new Error(
      "AnnotationFeed item parts must render inside <AnnotationFeed.Item>"
    )
  }
  return context.annotation as Annotation<TAnchor>
}

function defaultFormatTimestamp(createdMs: number) {
  return new Date(createdMs).toISOString()
}

function Root<TAnchor = unknown>({
  annotations,
  children,
  renderBody,
  formatTimestamp = defaultFormatTimestamp,
  className,
}: {
  annotations?: readonly Annotation<TAnchor>[]
  children?: ReactNode
  renderBody?: (
    body: string,
    annotation: Annotation<TAnchor>
  ) => ReactNode
  formatTimestamp?: (createdMs: number) => ReactNode
  className?: string
}) {
  return (
    <AnnotationFeedContext.Provider
      value={
        { formatTimestamp, renderBody } as AnnotationFeedContextValue<unknown>
      }
    >
      <section
        data-slot="annotation-feed"
        className={cn("space-y-2", className)}
      >
        {children ??
          (annotations && annotations.length > 0
            ? annotations.map((annotation) => (
                <DefaultItem key={annotation.id} annotation={annotation} />
              ))
            : <Empty />)}
      </section>
    </AnnotationFeedContext.Provider>
  )
}

function Empty({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <p className={cn("px-1 py-2 text-xs text-muted-foreground", className)}>
      {children ?? "No annotations yet."}
    </p>
  )
}

function Item<TAnchor>({
  annotation,
  children,
  className,
}: {
  annotation: Annotation<TAnchor>
  children?: ReactNode
  className?: string
}) {
  return (
    <AnnotationItemContext.Provider
      value={{ annotation } as AnnotationItemContextValue<unknown>}
    >
      <article
        data-slot="annotation-feed-item"
        data-kind={annotation.kind}
        data-status={annotation.status}
        className={cn(
          "rounded-lg border border-border/70 bg-card/45 p-3 text-sm",
          className
        )}
      >
        {children ?? <DefaultItemBody />}
      </article>
    </AnnotationItemContext.Provider>
  )
}

function Kind({
  showIcon = true,
  className,
}: {
  showIcon?: boolean
  className?: string
}) {
  const annotation = useAnnotationItem()
  const { Icon, label, tone } = KIND_META[annotation.kind]

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-mono text-[10px]",
        toneBgVariants({ tone }),
        toneTextVariants({ tone }),
        className
      )}
    >
      {showIcon && <Icon aria-hidden="true" className="size-2.5" />}
      {label}
    </Badge>
  )
}

function Status({ className }: { className?: string }) {
  const annotation = useAnnotationItem()
  const tone = STATUS_TONE[annotation.status]

  return (
    <span
      className={cn(
        "font-mono text-[10px]",
        toneTextVariants({ tone }),
        className
      )}
    >
      {annotation.status}
    </span>
  )
}

function Body({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const annotation = useAnnotationItem()
  const { renderBody } = useAnnotationFeed()

  return (
    <div
      data-slot="annotation-feed-body"
      className={cn(
        "text-sm leading-relaxed text-foreground/85",
        className
      )}
    >
      {children ?? renderBody?.(annotation.body, annotation) ?? annotation.body}
    </div>
  )
}

function Meta({ className }: { className?: string }) {
  const annotation = useAnnotationItem()
  const { formatTimestamp } = useAnnotationFeed()

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 font-mono text-[10px] text-muted-foreground",
        className
      )}
    >
      <span>{annotation.author}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={new Date(annotation.createdMs).toISOString()}>
        {formatTimestamp(annotation.createdMs)}
      </time>
    </div>
  )
}

function DefaultItemBody() {
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <Kind />
        <Meta className="min-w-0 flex-1" />
        <Status />
      </div>
      <Body />
    </>
  )
}

function DefaultItem<TAnchor>({
  annotation,
}: {
  annotation: Annotation<TAnchor>
}) {
  return <Item annotation={annotation} />
}

export const AnnotationFeed = {
  Root,
  Item,
  Kind,
  Status,
  Body,
  Meta,
  Empty,
}
