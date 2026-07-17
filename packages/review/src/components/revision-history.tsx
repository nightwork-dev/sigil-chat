"use client"

// RevisionHistory — a domain-free lineage view for drafts, image builds,
// audio takes, or any other reviewed content variant.
//
// The host adapts its store rows into ReviewRevision before rendering. Details
// such as word count or media dimensions arrive as formatted strings, keeping
// this package free of Tapestry's Draft type and of any one medium's schema.

import {
  createContext,
  useContext,
  type ReactNode,
} from "react"
import { cva } from "class-variance-authority"
import { FileTextIcon, GitBranchIcon } from "lucide-react"

import { StatusDot } from "@workspace/ui/components/status-dot"
import {
  toneTextVariants,
  type Tone,
} from "@workspace/ui/lib/tone"
import { cn } from "@workspace/ui/lib/utils"
import type {
  ReviewRevision,
  ReviewStatus,
} from "@workspace/review/lib/types"

const STATUS_TONE: Record<ReviewStatus, Tone> = {
  proposed: "warning",
  current: "primary",
  superseded: "muted",
  rejected: "destructive",
}

const revisionItemVariants = cva(
  "rounded-lg border bg-card/45 p-3",
  {
    variants: {
      status: {
        proposed: "border-warning/40",
        current: "border-primary/50 ring-1 ring-primary/20",
        superseded: "border-border/70",
        rejected: "border-destructive/40",
      },
    },
  },
)

interface RevisionHistoryContextValue {
  revisions: readonly ReviewRevision[]
  compact: boolean
}

const RevisionHistoryContext =
  createContext<RevisionHistoryContextValue | null>(null)

const RevisionItemContext = createContext<ReviewRevision | null>(null)

function useRevisionHistory() {
  const context = useContext(RevisionHistoryContext)
  if (!context) {
    throw new Error(
      "RevisionHistory parts must render inside <RevisionHistory.Root>",
    )
  }
  return context
}

function useRevisionItem() {
  const revision = useContext(RevisionItemContext)
  if (!revision) {
    throw new Error(
      "RevisionHistory item parts must render inside <RevisionHistory.Item>",
    )
  }
  return revision
}

function Root({
  revisions,
  compact = false,
  children,
  className,
}: {
  revisions: readonly ReviewRevision[]
  compact?: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <RevisionHistoryContext.Provider value={{ revisions, compact }}>
      <section
        data-slot="revision-history"
        className={cn("space-y-3", className)}
      >
        {children ?? (
          <>
            <Heading />
            <List />
          </>
        )}
      </section>
    </RevisionHistoryContext.Provider>
  )
}

function Heading({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground",
        className,
      )}
    >
      <GitBranchIcon className="size-3" />
      {children ?? "Revision history"}
    </h2>
  )
}

function List({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const { revisions } = useRevisionHistory()

  return (
    <div data-slot="revision-history-list" className={cn("space-y-2", className)}>
      {children ??
        (revisions.length > 0
          ? revisions.map((revision) => (
              <Item key={revision.id} revision={revision} />
            ))
          : <Empty />)}
    </div>
  )
}

function Item({
  revision,
  children,
  className,
}: {
  revision: ReviewRevision
  children?: ReactNode
  className?: string
}) {
  return (
    <RevisionItemContext.Provider value={revision}>
      <article
        data-slot="revision-history-item"
        data-status={revision.status}
        className={cn(
          revisionItemVariants({ status: revision.status }),
          className,
        )}
      >
        {children ?? <DefaultItem />}
      </article>
    </RevisionItemContext.Provider>
  )
}

function Label({ className }: { className?: string }) {
  const revision = useRevisionItem()

  return (
    <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", className)}>
      {revision.label}
    </span>
  )
}

function Status({ className }: { className?: string }) {
  const revision = useRevisionItem()
  const tone = STATUS_TONE[revision.status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px]",
        toneTextVariants({ tone }),
        className,
      )}
    >
      <StatusDot status={tone} size="sm" />
      {revision.status}
    </span>
  )
}

function Meta({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const revision = useRevisionItem()

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground",
        className,
      )}
    >
      {children ?? (
        <>
          <span>{revision.id}</span>
          {revision.parentId && <span>← {revision.parentId}</span>}
          {revision.details?.map((detail, index) => (
            <span key={`${revision.id}-detail-${index}`}>{detail}</span>
          ))}
          <span>{revision.authoredBy}</span>
        </>
      )}
    </div>
  )
}

function Note({ className }: { className?: string }) {
  const revision = useRevisionItem()
  const { compact } = useRevisionHistory()

  if (compact || !revision.note) return null

  return (
    <p className={cn("mt-1 text-xs text-muted-foreground", className)}>
      {revision.note}
    </p>
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
      {children ?? "No revision history."}
    </p>
  )
}

function DefaultItem() {
  return (
    <>
      <div className="flex items-center gap-2">
        <FileTextIcon className="size-3 text-muted-foreground" />
        <Label />
        <Status />
      </div>
      <div className="mt-2">
        <Meta />
        <Note />
      </div>
    </>
  )
}

export const RevisionHistory = {
  Root,
  Heading,
  List,
  Item,
  Label,
  Status,
  Meta,
  Note,
  Empty,
}
