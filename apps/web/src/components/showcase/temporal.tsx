import { useState } from "react";
import { BellIcon, InboxIcon } from "lucide-react";
import { AttentionTile } from "@workspace/ui/components/attention-tile";
import { EraBand } from "@workspace/ui/components/era-band";
import { TimeScrubber } from "@workspace/ui/components/time-scrubber";
import { Exhibit } from "@/components/showcase/exhibit";

// Neutral, domain-free demo data — no era names, no calendar notation. The
// components take display-shaped props; these demos stand in for the
// caller-computed positions/states an app would hand in.

const PROPORTIONAL_ERAS = [
  {
    id: "p1",
    label: "Phase 1",
    subtitle: "measured 0–25%",
    tone: "bg-chart-1/60",
    span: { start: 0, end: 0.25 },
  },
  {
    id: "p2",
    label: "Phase 2",
    subtitle: "measured 25–75%",
    tone: "bg-chart-2/60",
    span: { start: 0.25, end: 0.75 },
    softStart: true,
    softEnd: true,
  },
  {
    id: "p3",
    label: "Phase 3",
    subtitle: "measured 75–100%",
    tone: "bg-chart-3/60",
    span: { start: 0.75, end: 1 },
  },
];

const SEQUENCE_ERAS = Array.from({ length: 12 }, (_, i) => ({
  id: `s${i + 1}`,
  label: `S${String(i + 1).padStart(2, "0")}`,
  // span omitted → order-only (sequence) segments, the honest "we know the
  // order, not the duration" treatment. 12 of them exercise horizontal scroll.
}));

const MIXED_ERAS = [
  {
    id: "m1",
    label: "Measured A",
    tone: "bg-chart-1/60",
    span: { start: 0, end: 0.4 },
  },
  { id: "m2", label: "Order-only" },
  {
    id: "m3",
    label: "Measured B",
    tone: "bg-chart-3/60",
    span: { start: 0.4, end: 1 },
  },
];

const SCRUBBER_STOPS = Array.from({ length: 9 }, (_, i) => ({
  id: `stop-${i + 1}`,
  position: i / 8,
  label: `Stop ${i + 1}`,
  ...(i === 2 ? { extent: { start: 0.18, end: 0.34, softEnd: true } } : {}),
}));

const SCRUBBER_ZONES = [
  { start: 0.28, end: 0.4 }, // an indeterminate (hatched) span between stops
];

export function TemporalShowcase() {
  const [scrubberValue, setScrubberValue] = useState<string | null>("stop-3");
  const [scrubberLast, setScrubberLast] = useState<string>("—");
  const [eraCursor, setEraCursor] = useState<number | null>(0.5);
  const [selectedEra, setSelectedEra] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Exhibit
          title="Attention Tile · live"
          subtitle="count + preview rows"
          installName="attention-tile"
        >
          <AttentionTile
            title="Review queue"
            state="live"
            count={3}
            glyph={<BellIcon />}
            items={[
              { id: "i1", label: "First waiting item", meta: "2m" },
              {
                id: "i2",
                label: "Second waiting item with a longer label",
                meta: "1h",
              },
              { id: "i3", label: "Third", meta: "1d" },
            ]}
            onOpen={() => {}}
          />
        </Exhibit>
        <Exhibit
          title="Attention Tile · empty"
          subtitle="honest empty state — no count"
          installName="attention-tile"
        >
          <AttentionTile
            title="Review queue"
            state="empty"
            glyph={<InboxIcon />}
            onOpen={() => {}}
          />
        </Exhibit>
        <Exhibit
          title="Attention Tile · loading"
          subtitle="skeleton rows ≠ empty"
          installName="attention-tile"
        >
          <AttentionTile
            title="Review queue"
            state="loading"
            glyph={<InboxIcon />}
            onOpen={() => {}}
          />
        </Exhibit>
      </div>

      <Exhibit
        title="Era Band · proportional"
        subtitle="measured spans · soft boundaries · cursor + select"
        installName="era-band"
      >
        <EraBand
          eras={PROPORTIONAL_ERAS}
          cursor={eraCursor}
          cursorLabel={
            eraCursor == null
              ? undefined
              : `Selected position ${Math.round(eraCursor * 100)} percent`
          }
          onSelectEra={(id) => setSelectedEra(id)}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Selected:{" "}
            <span className="font-mono text-foreground">
              {selectedEra ?? "none"}
            </span>
          </span>
          <label className="flex items-center gap-2">
            cursor
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={eraCursor ?? 0}
              onChange={(e) => setEraCursor(Number(e.target.value))}
              className="w-32 accent-primary"
            />
          </label>
        </div>
      </Exhibit>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Exhibit
          title="Era Band · sequence (12)"
          subtitle="order-only · equal-width · scrolls at 375px"
          installName="era-band"
        >
          <EraBand eras={SEQUENCE_ERAS} height="sm" />
        </Exhibit>
        <Exhibit
          title="Era Band · mixed"
          subtitle="proportional (solid) + order-only (hatch)"
          installName="era-band"
        >
          <EraBand eras={MIXED_ERAS} height="sm" cursor={0.55} />
        </Exhibit>
      </div>

      <Exhibit
        title="Time Scrubber"
        subtitle="snap-to-stop · keyboard · hatched indeterminate span"
        installName="time-scrubber"
      >
        <TimeScrubber
          stops={SCRUBBER_STOPS}
          value={scrubberValue}
          zones={SCRUBBER_ZONES}
          onChange={setScrubberValue}
          onCommit={(id) => setScrubberLast(id)}
          presentLabel="Return to latest"
          onReturnToPresent={() => {
            setScrubberValue(SCRUBBER_STOPS[SCRUBBER_STOPS.length - 1]!.id);
            setScrubberLast("latest");
          }}
          aria-label="Demo scrubber"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Last commit:{" "}
          <span className="font-mono text-foreground">{scrubberLast}</span>.
          Drag the track (snaps), or focus it and use ←/→ (step), Home/End
          (jump), Enter (commit).
        </p>
      </Exhibit>
    </div>
  );
}
