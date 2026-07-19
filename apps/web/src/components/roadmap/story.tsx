"use client"

// The roadmap Story as a compound component. One Story renders three ways —
// a board card, the detail panel, and a review-queue row — by composing the
// same parts against a shared context, so no surface re-derives how a story
// looks. Presentation maps (status/routing/gate) are exported alongside because
// the board's column headers and the queue rows share the same vocabulary.

import { createContext, useContext, type ReactNode } from "react"
import { CheckIcon, GavelIcon, MonitorIcon, UsersIcon } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import type { ReviewGate, Routing, Story as StoryData, StoryStatus } from "@workspace/work-items-store/types"

// ── Shared presentation vocabulary ──────────────────────────────────────────

// Pipeline order for the board columns: pre-work → active → done, with blocked
// held apart as an exception lane rather than a pipeline stage.
export const STORY_STATUS_ORDER: StoryStatus[] = [
  "idea",
  "spec",
  "ready",
  "in-progress",
  "verify",
  "shipped",
  "blocked",
]

interface StatusPresentation {
  label: string
  // Soft tint drawn from theme tone tokens (never raw palette) so status keeps
  // its meaning across every theme. The label always renders, so color is a
  // reinforcement, not the only cue.
  badgeClass: string
}

export const STORY_STATUS: Record<StoryStatus, StatusPresentation> = {
  idea: { label: "Idea", badgeClass: "bg-muted text-muted-foreground" },
  spec: { label: "Spec", badgeClass: "bg-info/15 text-info" },
  ready: { label: "Ready", badgeClass: "bg-primary/15 text-primary" },
  "in-progress": { label: "In progress", badgeClass: "bg-warning/15 text-warning" },
  verify: { label: "Verify", badgeClass: "bg-info/15 text-info" },
  shipped: { label: "Shipped", badgeClass: "bg-success/15 text-success" },
  blocked: { label: "Blocked", badgeClass: "bg-destructive/15 text-destructive" },
}

const ROUTING_LABEL: Record<Routing, string> = {
  self: "self",
  "claude:opus": "claude:opus",
  "claude:sonnet": "claude:sonnet",
  "pi:luna": "pi:luna",
  codex: "codex",
}

// browser:David / decision:David are David's own gates (actionable by him);
// peer is someone else's; none carries no review and renders nothing.
const GATE_META: Record<ReviewGate, { label: string; icon: typeof GavelIcon; david: boolean } | null> = {
  "browser:David": { label: "Browser review", icon: MonitorIcon, david: true },
  "decision:David": { label: "Decision", icon: GavelIcon, david: true },
  peer: { label: "Peer review", icon: UsersIcon, david: false },
  none: null,
}

export function isDavidGate(gate: ReviewGate): boolean {
  return GATE_META[gate]?.david ?? false
}

// ── Context ─────────────────────────────────────────────────────────────────

const StoryContext = createContext<StoryData | null>(null)

function useStoryContext(): StoryData {
  const ctx = useContext(StoryContext)
  if (!ctx) throw new Error("Story parts must be used inside <Story.Root>")
  return ctx
}

interface RootProps {
  story: StoryData
  children: ReactNode
  className?: string
}

function Root({ story, children, className }: RootProps) {
  return (
    <StoryContext.Provider value={story}>
      <div data-slot="story" className={className}>
        {children}
      </div>
    </StoryContext.Provider>
  )
}

function Title({ className }: { className?: string }) {
  const { title } = useStoryContext()
  return (
    <span data-slot="story-title" className={cn("font-medium leading-snug text-foreground", className)}>
      {title}
    </span>
  )
}

function Status({ className }: { className?: string }) {
  const { status } = useStoryContext()
  const meta = STORY_STATUS[status]
  return (
    <Badge variant="outline" className={cn(meta.badgeClass, "border-transparent", className)}>
      {meta.label}
    </Badge>
  )
}

function RoutingBadge({ className }: { className?: string }) {
  const { routing } = useStoryContext()
  // One encoding per fact (David's persistence-ladder): the label already
  // carries the routing (e.g. "claude:opus"), so the bot/person icon is a
  // redundant second encoding — dropped.
  return (
    <Badge variant="outline" className={cn("font-mono", className)}>
      {ROUTING_LABEL[routing]}
    </Badge>
  )
}

// Glanceable metadata row: story id, the review gate (when one applies), and
// the dependency count. Everything here is a value that can change per story;
// nothing is decorative.
function Meta({ className }: { className?: string }) {
  const { id, reviewGate, deps } = useStoryContext()
  const gate = GATE_META[reviewGate]
  const GateIcon = gate?.icon
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.625rem] text-muted-foreground", className)}>
      <span className="font-mono">{id}</span>
      {gate ? (
        <span
          className={cn(
            "inline-flex items-center gap-1",
            gate.david ? "text-info" : "text-muted-foreground",
          )}
        >
          {GateIcon ? <GateIcon className="size-2.5" aria-hidden="true" /> : null}
          {gate.label}
        </span>
      ) : null}
      {deps.length > 0 ? (
        <span className="font-mono">
          {deps.length} dep{deps.length === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  )
}

function AcceptanceList({ className }: { className?: string }) {
  const { acceptanceCriteria } = useStoryContext()
  if (acceptanceCriteria.length === 0) return null
  return (
    <ul className={cn("space-y-2", className)}>
      {acceptanceCriteria.map((criterion) => (
        <li key={criterion} className="flex gap-2 text-sm leading-6">
          <CheckIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{criterion}</span>
        </li>
      ))}
    </ul>
  )
}

export const Story = { Root, Title, Status, RoutingBadge, Meta, AcceptanceList }
