// View: Inbox (list-detail)
//
// Canonical list-detail content surface designed to FILL the SplitShell: the
// master pane (`InboxView.List`) drops into the shell's `list` slot, the
// detail pane (`InboxView.Detail`) fills its content region. Both parts read a
// shared selection from `InboxView.Root`'s Context, so clicking a row in one
// slot populates the detail in the other — a real state transition, no router
// coupling (spec §5: portable, drops into any Layout).
//
// Compound Root/Parts + Context is the repo's mandated pattern for a domain
// object (a message) rendered in more than one place (list row vs detail).
//
// Controlled/uncontrolled selection: `Root` accepts OPTIONAL `selectedId` +
// `onSelect`. Omit both and selection is internal state (the portable
// default — drops into any Layout with zero router coupling). Supply both
// and the caller drives selection — this is how the `/split` route adapter
// wires URL-addressable deep-linking (`split.tsx`/`split/$id.tsx`) without
// InboxView itself importing the router. InboxView still imports no router.
//
// Decoupled: `Root` takes its `items` via props; no app singletons. A shared
// sample dataset (`INBOX_ITEMS`) is exported alongside so hosts have real
// content to render, but the View itself is data-agnostic.

import { createContext, useContext, useState, type ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { DataLabel } from "@workspace/ui/components/data-label"
import { PageHeader } from "@workspace/ui/components/blocks/page-header"

// -- Data contract --

export interface InboxItem {
  id: string
  sender: string
  subject: string
  preview: string
  body: string
  tag: string
  time: string
  unread: boolean
  /** Drives the leading StatusDot: work state of the item. */
  status: "active" | "resolved" | "failed"
}

/** Map an item's work state to the shared StatusDot taxonomy. */
function dotStatus(status: InboxItem["status"]) {
  return status === "active" ? "active" : status === "failed" ? "danger" : "muted"
}

// -- Shared context --

interface InboxContextValue {
  items: InboxItem[]
  selectedId: string | null
  select: (id: string) => void
}

const InboxContext = createContext<InboxContextValue | null>(null)

function useInbox() {
  const ctx = useContext(InboxContext)
  if (!ctx) throw new Error("InboxView parts must be used within <InboxView.Root>")
  return ctx
}

function Root({
  items,
  defaultSelectedId = null,
  selectedId: controlledSelectedId,
  onSelect,
  children,
}: {
  items: InboxItem[]
  /** Uncontrolled starting selection. Ignored once `selectedId` is passed. */
  defaultSelectedId?: string | null
  /** Controlled selection — pass alongside `onSelect` to let the caller (e.g.
   *  a router-aware route adapter) drive selection instead of internal state. */
  selectedId?: string | null
  /** Required when `selectedId` is controlled; called instead of writing
   *  internal state. */
  onSelect?: (id: string) => void
  children: ReactNode
}) {
  const isControlled = controlledSelectedId !== undefined
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(defaultSelectedId)

  const selectedId = isControlled ? controlledSelectedId : internalSelectedId
  const select = isControlled ? (onSelect ?? (() => {})) : setInternalSelectedId

  return (
    <InboxContext.Provider value={{ items, selectedId, select }}>
      {children}
    </InboxContext.Provider>
  )
}

// -- Master pane --

function List() {
  const { items, selectedId, select } = useInbox()
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const active = item.id === selectedId
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => select(item.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors",
                active ? "bg-sidebar-accent" : "hover:bg-muted/50",
              )}
            >
              <div className="flex items-center gap-2">
                <StatusDot status={dotStatus(item.status)} size="sm" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs",
                    item.unread ? "font-semibold text-foreground" : "font-medium text-foreground/80",
                  )}
                >
                  {item.subject}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {item.time}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  <span className="text-foreground/70">{item.sender}</span>
                  {" — "}
                  {item.preview}
                </span>
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                  {item.tag}
                </Badge>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// -- Detail pane --

function Detail() {
  const { items, selectedId } = useInbox()
  const item = items.find((i) => i.id === selectedId) ?? null

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-xs text-muted-foreground">Select a message to read it.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <PageHeader
        title={item.subject}
        description={`${item.sender} · ${item.time}`}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <DataLabel label="Category" value={item.tag} orientation="stacked" />
        <DataLabel label="Status" value={item.status} orientation="stacked" />
        <DataLabel label="ID" value={`#${item.id}`} orientation="stacked" />
      </div>
      <p className="text-sm leading-relaxed text-foreground/90">{item.body}</p>
    </div>
  )
}

export const InboxView = { Root, List, Detail }

// -- Shared sample data (hosts reuse this; the View stays data-agnostic) --

export const INBOX_ITEMS: InboxItem[] = [
  {
    id: "1",
    sender: "deploy-bot",
    subject: "Deployment succeeded",
    preview: "web · production · 42s build",
    body: "The production build for `web` completed in 42 seconds and is now live. All 214 smoke checks passed; no rollback was required.",
    tag: "deploy",
    time: "09:41",
    unread: true,
    status: "resolved",
  },
  {
    id: "2",
    sender: "billing",
    subject: "New sign-up on acme.co",
    preview: "Pro trial started · 14 days left",
    body: "A new workspace `acme.co` started a Pro trial. The trial converts to a paid plan in 14 days unless cancelled. No payment method on file yet.",
    tag: "billing",
    time: "09:12",
    unread: true,
    status: "active",
  },
  {
    id: "3",
    sender: "monitor",
    subject: "Latency alert cleared",
    preview: "p99 back under 200ms",
    body: "The p99 latency alert opened at 08:30 has cleared. p99 is back under the 200ms threshold across all regions after the cache warmed.",
    tag: "alert",
    time: "08:47",
    unread: false,
    status: "resolved",
  },
  {
    id: "4",
    sender: "reports",
    subject: "Weekly digest ready",
    preview: "12,847 requests · 0.3% errors",
    body: "Your weekly traffic digest is ready: 12,847 requests, a 0.3% error rate, and a median latency of 42ms. Traffic is up 14% week over week.",
    tag: "report",
    time: "Mon",
    unread: false,
    status: "resolved",
  },
  {
    id: "5",
    sender: "david",
    subject: "Comment on PR #218",
    preview: "\"ship it once tests pass\"",
    body: "David commented on pull request #218: \"Looks good — ship it once tests pass. Let's hold the migration until the backfill job drains.\"",
    tag: "review",
    time: "Fri",
    unread: false,
    status: "active",
  },
  {
    id: "6",
    sender: "security",
    subject: "API key rotation failed",
    preview: "sk-live-… · retry scheduled",
    body: "The scheduled rotation of `sk-live-…` failed because the previous key was still in use by two workers. A retry is scheduled for the next maintenance window.",
    tag: "security",
    time: "Thu",
    unread: false,
    status: "failed",
  },
]
