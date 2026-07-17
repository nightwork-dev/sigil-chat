import { useEffect, useRef } from "react"
import { ExhibitCard } from "@workspace/ui/components/exhibit-card"
import { Timeline, useTimelineStore } from "@workspace/ui/components/timeline"
import type { TimelineEvent } from "@workspace/ui/lib/timeline/types"
import type { AbsoluteSchedule } from "@workspace/ui/lib/timeline/schedule/types"
import { campaignDemo, maintenanceDemo, blackFridayDemo, weeklyTournamentDemo, dailyStandupDemo, DEMO_NOW } from "@/components/showcase/schedule-demo-data"

// Fixed reference date, not Date.now() — computing this at module scope
// with a live clock would produce a different value on the server than on
// the client's first render, the same SSR/hydration-mismatch class of bug
// already fixed elsewhere this session for Math.random().
const TIMELINE_BASE = new Date("2026-07-01T09:00:00Z").getTime()
const DAY = 86_400_000
const HOUR = 3_600_000

// A real gantt-shaped pipeline, not a flat single-lane list: backend and
// frontend run in parallel (overlapping ranges force the greedy lane-
// packer to actually pack two lanes), and every step is pre-linked via
// `relationships` so the dependency arrows are visible immediately without
// needing to demonstrate the vertical-drag-to-link gesture first.
const TIMELINE_EVENTS: TimelineEvent[] = [
  { id: "kickoff", type: "instantaneous", title: "Kickoff", timestamp: TIMELINE_BASE },
  { id: "requirements", type: "range", title: "Requirements", startTime: TIMELINE_BASE, endTime: TIMELINE_BASE + 2 * DAY },
  { id: "design", type: "range", title: "Design", startTime: TIMELINE_BASE + 2 * DAY, endTime: TIMELINE_BASE + 4 * DAY },
  { id: "backend", type: "range", title: "Backend", startTime: TIMELINE_BASE + 4 * DAY, endTime: TIMELINE_BASE + 8 * DAY },
  { id: "frontend", type: "range", title: "Frontend", startTime: TIMELINE_BASE + 4 * DAY, endTime: TIMELINE_BASE + 9 * DAY },
  { id: "testing", type: "range", title: "Testing", startTime: TIMELINE_BASE + 9 * DAY, endTime: TIMELINE_BASE + 11 * DAY },
  { id: "staging", type: "range", title: "Staging", startTime: TIMELINE_BASE + 11 * DAY, endTime: TIMELINE_BASE + 12 * DAY },
  { id: "uat", type: "range", title: "UAT", startTime: TIMELINE_BASE + 12 * DAY, endTime: TIMELINE_BASE + 14 * DAY },
  { id: "prod", type: "instantaneous", title: "Prod", timestamp: TIMELINE_BASE + 14 * DAY },
]

const TIMELINE_RELATIONSHIPS: Record<string, { parentId?: string; childIds: string[] }> = {
  kickoff: { childIds: ["requirements"] },
  requirements: { parentId: "kickoff", childIds: ["design"] },
  design: { parentId: "requirements", childIds: ["backend", "frontend"] },
  backend: { parentId: "design", childIds: [] },
  frontend: { parentId: "design", childIds: ["testing"] },
  testing: { parentId: "frontend", childIds: ["staging"] },
  staging: { parentId: "testing", childIds: ["uat"] },
  uat: { parentId: "staging", childIds: ["prod"] },
  prod: { parentId: "uat", childIds: [] },
}

// The scheduling demos are full schedule trees (vector children, constraints,
// recurrence) — seeded via `tree`, not the flat `events` legacy path. The
// canvas renders a root's CHILDREN, so the demo's own top node (the Fit target
// / recurring series) is nested under a synthetic root to make it a selectable,
// draggable bar of its own.
function withRoot(node: AbsoluteSchedule): AbsoluteSchedule {
  return {
    kind: "absolute",
    id: `${node.id}-root`,
    start: node.start,
    timeContext: { kind: "wallClock", unit: "milliseconds" },
    boundsMode: "fixed",
    payload: { type: "timeline-root", data: {} },
    children: [node],
  }
}

const blackFriday = withRoot(blackFridayDemo as AbsoluteSchedule)
const campaign = withRoot(campaignDemo as AbsoluteSchedule)
const maintenance = withRoot(maintenanceDemo as AbsoluteSchedule)
const dailyStandup = withRoot(dailyStandupDemo as AbsoluteSchedule)

// The demo trees declare `unit: "milliseconds"` on their wallClock context
// (spec §1.8, 0.3.2), so the real `weekly` frequency steps 7 calendar days —
// the old custom-interval workaround for the seconds-assuming engine is gone.
const weeklyRecurring = weeklyTournamentDemo as AbsoluteSchedule
const weeklyTournament = withRoot({
  ...weeklyRecurring,
  // Widen the recurring window to ~36h so the focused bar is grabbable at the
  // multi-week zoom where the shadow series reads (the spec's 4h window is a
  // sliver across a 5-week viewport).
  end: weeklyRecurring.start + 36 * HOUR,
})

/**
 * Seeds one occurrence override once at mount so the "Recurring series"
 * exhibit demonstrates the cancelled-occurrence slashed outline (UI spec
 * §5.2) without requiring a user gesture first. The store only accepts
 * overrides through its `cancelOccurrence` action (it always starts with an
 * empty override map — seeding via the tree itself isn't possible, and
 * store.ts internals are out of scope for this story), so this calls that
 * action once against the external zustand store — not a React-state sync,
 * the one case an effect is the right tool here.
 */
function SeedCancelledOccurrence({ nodeId, occurrenceIndex }: { nodeId: string; occurrenceIndex: number }) {
  const store = useTimelineStore()
  const cancelOccurrence = store((s) => s.cancelOccurrence)
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    cancelOccurrence(nodeId, occurrenceIndex, true)
  }, [cancelOccurrence, nodeId, occurrenceIndex])
  return null
}

export function TimelineShowcase() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <ExhibitCard
        title="Timeline / Gantt"
        subtitle="drag to reschedule (dragging a parent moves its whole subtree), drag an edge to resize, drag vertically onto another event to link it as a child"
      >
        <Timeline.Root events={TIMELINE_EVENTS} relationships={TIMELINE_RELATIONSHIPS} viewStart={TIMELINE_BASE - DAY} viewEnd={TIMELINE_BASE + 15 * DAY}>
          <div className="flex items-center justify-between">
            <Timeline.Legend />
            <span className="text-[10px] text-muted-foreground">scroll to pan · ⌘/ctrl+scroll to zoom · shift-click to multi-select</span>
          </div>
          <Timeline.Canvas />
          <Timeline.Minimap />
        </Timeline.Root>
      </ExhibitCard>

      <ExhibitCard
        title="Scheduling · Conflicts"
        subtitle="Migration is min 45m/max 2h inside a fixed 1h Maintenance Window — it overruns by the badge's amount; click ⤢ fit to compress it (and any sibling slack) back inside the parent"
      >
        <Timeline.Root tree={maintenance} viewStart={DEMO_NOW + 3 * DAY - 2 * HOUR} viewEnd={DEMO_NOW + 3 * DAY + 4 * HOUR}>
          <Timeline.Canvas />
          <Timeline.Minimap />
        </Timeline.Root>
      </ExhibitCard>

      <ExhibitCard
        title="Scheduling · Auto-bounds parent"
        subtitle="Campaign's window is derived from its 3 phases (dashed/translucent = computed, not authored) · drag Live's end handle outward — a translucent ghost previews the parent's new bounds before you release"
      >
        <Timeline.Root tree={campaign} viewStart={DEMO_NOW} viewEnd={DEMO_NOW + 14 * DAY}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="flex flex-col gap-2">
              <Timeline.Canvas />
              <Timeline.Minimap />
            </div>
            <Timeline.Inspector />
          </div>
        </Timeline.Root>
      </ExhibitCard>

      <ExhibitCard
        title="Scheduling · Fit / Trim"
        subtitle="Sale Week is a 7-day template (teaser → offers → drain) compressing into a Black Friday slot: Fit to 72h succeeds exactly, Fit to 48h fails (deficit + blockers) · the inspector edits anchor, constraints, bounds, recurrence · ⌘Z / ⇧⌘Z to undo"
      >
        <Timeline.Root tree={blackFriday} viewStart={DEMO_NOW + 6 * DAY} viewEnd={DEMO_NOW + 16 * DAY}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="flex flex-col gap-2">
              <Timeline.Canvas />
              <Timeline.Minimap />
            </div>
            <Timeline.Inspector />
          </div>
        </Timeline.Root>
      </ExhibitCard>

      <ExhibitCard
        title="Scheduling · Recurring series + shadows"
        subtitle="drag the focused bar to move the whole series · ⌘-drag an echo to override one occurrence · plain-drag an echo, then choose this-occurrence-or-series · click an echo to re-center · 3rd occurrence pre-cancelled (slashed outline)"
      >
        <Timeline.Root tree={weeklyTournament} viewStart={DEMO_NOW} viewEnd={DEMO_NOW + 35 * DAY}>
          <SeedCancelledOccurrence nodeId="weekly-tournament" occurrenceIndex={2} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="flex flex-col gap-2">
              <Timeline.Canvas />
              <Timeline.Minimap />
            </div>
            <Timeline.Inspector />
          </div>
        </Timeline.Root>

        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Overflow cap</span>
          <p className="text-[11px] text-muted-foreground">Daily standup, 40 occurrences in view — shadows cap at 24; the rest collapse into the "×N through …" chip on the focused bar.</p>
          <Timeline.Root tree={dailyStandup} viewStart={DEMO_NOW} viewEnd={DEMO_NOW + 40 * DAY}>
            <Timeline.Canvas />
          </Timeline.Root>
        </div>
      </ExhibitCard>
    </div>
  )
}
