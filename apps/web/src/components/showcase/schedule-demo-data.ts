// Demo schedule trees for the Timeline scheduling exhibit — direct
// transcriptions of SCHEDULE-SPEC-v2.md §10's worked examples, so the showcase
// demonstrates the exact cases the spec (and conformance corpus) pin down.
//
// UNITS: this app's wallClock convention is unix MILLISECONDS (matching the
// existing Timeline component and Date interop), declared per tree via
// `timeContext.unit` (spec §1.8, 0.3.2) so calendar recurrence steps
// correctly. The conformance corpus uses seconds (spec §10 uses unix
// seconds) — do not copy numbers between the two without converting.

import type { Schedule } from "@workspace/ui/lib/timeline/schedule/types"

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** A stable "now" for demos: 2026-07-06 Mon 00:00 UTC. Demos position around it. */
export const DEMO_NOW = Date.UTC(2026, 6, 6)

/** Monday-start week grid origin (2026-07-06 is a Monday). */
export const WEEK_GRID = { unit: 7 * DAY, mode: "nearest" as const, origin: DEMO_NOW }

/**
 * Auto campaign with the seed rule (spec §10 "Auto parent with the seed rule"):
 * chained phases, derived window, add-a-phase-and-it-grows.
 */
export const campaignDemo: Schedule = {
  kind: "absolute",
  id: "campaign",
  start: DEMO_NOW + DAY, // seed
  timeContext: { kind: "wallClock", unit: "milliseconds" },
  boundsMode: "auto",
  payload: { type: "phase-group", data: { label: "Campaign" } },
  children: [
    {
      kind: "vector",
      id: "preview",
      alignment: { kind: "startOfParent" },
      offset: { basis: 0, direction: "after", flex: 0 },
      duration: { basis: 2 * DAY, flex: 0 },
      boundsMode: "fixed",
      payload: { type: "phase", data: { label: "Preview" } },
      children: [],
    },
    {
      kind: "vector",
      id: "live",
      alignment: { kind: "endOf", siblingId: "preview" },
      offset: { basis: 0, direction: "after", flex: 0 },
      duration: { basis: 7 * DAY, flex: 0 },
      boundsMode: "fixed",
      payload: { type: "phase", data: { label: "Live" } },
      children: [],
    },
    {
      kind: "vector",
      id: "postview",
      alignment: { kind: "endOf", siblingId: "live" },
      offset: { basis: 0, direction: "after", flex: 0 },
      duration: { basis: 1 * DAY, flex: 0 },
      boundsMode: "fixed",
      payload: { type: "phase", data: { label: "Wind Down" } },
      children: [],
    },
  ],
}

/**
 * Fixed maintenance window with a conflicting-but-compressible child
 * (spec §10 "Fixed parent flagging an over-running child"): the conflict badge
 * + "fits if compressed" affordance demo.
 */
export const maintenanceDemo: Schedule = {
  kind: "absolute",
  id: "maintenance-window",
  start: DEMO_NOW + 3 * DAY,
  end: DEMO_NOW + 3 * DAY + 1 * HOUR, // exactly 1 hour, fixed
  timeContext: { kind: "wallClock", unit: "milliseconds" },
  boundsMode: "fixed",
  payload: { type: "ops", data: { label: "Maintenance Window" } },
  children: [
    {
      kind: "vector",
      id: "migration",
      alignment: { kind: "startOfParent" },
      offset: { basis: 0, direction: "after", flex: 0 },
      duration: { basis: 2 * HOUR, min: 45 * MIN, flex: 1 },
      boundsMode: "fixed",
      payload: { type: "task", data: { label: "DB Migration" } },
      children: [],
    },
  ],
}

/**
 * Black Friday template (spec §10): 7-day sale compressing into a 3-day slot.
 * minimalWindow = 66h; Fit to 72h = exact fit (teaser 12h, gap 0, offers 48h,
 * drain 12h); Fit to 48h fails with deficit 18h, blockers offers + drain.
 */
export const blackFridayDemo: Schedule = {
  kind: "absolute",
  id: "sale-week",
  start: DEMO_NOW + 7 * DAY, // seed
  timeContext: { kind: "wallClock", unit: "milliseconds" },
  boundsMode: "auto",
  payload: { type: "campaign", data: { label: "Sale Week Template" } },
  children: [
    {
      kind: "vector",
      id: "teaser",
      alignment: { kind: "startOfParent" },
      offset: { basis: 0, direction: "after", flex: 0 },
      duration: { basis: 1 * DAY, min: 6 * HOUR, flex: 1, quantum: { unit: 6 * HOUR, mode: "floor" } },
      boundsMode: "fixed",
      payload: { type: "phase", data: { label: "Teaser" } },
      children: [],
    },
    {
      kind: "vector",
      id: "main-offers",
      alignment: { kind: "endOf", siblingId: "teaser" },
      // Compressible slack gap: eats compression before the phases do.
      offset: { basis: 12 * HOUR, direction: "after", min: 0, flex: 3, quantum: { unit: 1 * HOUR, mode: "floor" } },
      duration: { basis: 5 * DAY, min: 2 * DAY, flex: 2, quantum: { unit: 1 * DAY, mode: "floor" } },
      boundsMode: "fixed",
      payload: { type: "phase", data: { label: "Main Offers" } },
      children: [],
    },
    {
      kind: "vector",
      id: "checkout-drain",
      alignment: { kind: "endOf", siblingId: "main-offers" },
      offset: { basis: 0, direction: "after", flex: 0 },
      duration: { basis: 12 * HOUR, flex: 0 }, // rigid: hard technical constraint
      boundsMode: "fixed",
      payload: { type: "phase", data: { label: "Checkout Drain" } },
      children: [],
    },
  ],
}

/**
 * Recurring weekly tournament (spec §10 "Recurring weekly, trimmed to the week
 * grid"): shadow rendering, series drag vs Cmd-drag occurrence override.
 * Bounded by `until` so shadows and the 24-cap have a real series to show.
 */
export const weeklyTournamentDemo: Schedule = {
  kind: "absolute",
  id: "weekly-tournament",
  start: DEMO_NOW + 2 * DAY + 18 * HOUR, // Wed 18:00 UTC
  end: DEMO_NOW + 2 * DAY + 22 * HOUR, // 4-hour window
  timeContext: { kind: "wallClock", unit: "milliseconds" },
  boundsMode: "fixed",
  recurrence: { frequency: "weekly", interval: 1, until: DEMO_NOW + 26 * 7 * DAY },
  payload: { type: "liveops", data: { label: "Weekly Tournament" } },
  children: [
    {
      kind: "vector",
      id: "tournament-finals",
      alignment: { kind: "endOfParent" },
      offset: { basis: 1 * HOUR, direction: "before", flex: 0 },
      duration: { basis: 1 * HOUR, flex: 0 },
      boundsMode: "fixed",
      payload: { type: "phase", data: { label: "Finals" } },
      children: [],
    },
  ],
}

/**
 * Dense daily recurrence (40 occurrences) — the only demo whose in-view
 * shadow count exceeds the §5.2 24-shadow cap, so the overflow chip
 * ("×N through …") actually renders instead of staying theoretical.
 */
export const dailyStandupDemo: Schedule = {
  kind: "absolute",
  id: "daily-standup",
  start: DEMO_NOW,
  end: DEMO_NOW + 30 * MIN,
  timeContext: { kind: "wallClock", unit: "milliseconds" },
  boundsMode: "fixed",
  recurrence: { frequency: "daily", interval: 1, until: DEMO_NOW + 40 * DAY },
  payload: { type: "liveops", data: { label: "Daily Standup" } },
  children: [
    {
      kind: "vector",
      id: "standup-notes",
      alignment: { kind: "endOfParent" },
      offset: { basis: 10 * MIN, direction: "before", flex: 0 },
      duration: { basis: 10 * MIN, flex: 0 },
      boundsMode: "fixed",
      payload: { type: "phase", data: { label: "Notes" } },
      children: [],
    },
  ],
}

export const scheduleDemos = {
  campaign: campaignDemo,
  maintenance: maintenanceDemo,
  blackFriday: blackFridayDemo,
  weeklyTournament: weeklyTournamentDemo,
  dailyStandup: dailyStandupDemo,
}
