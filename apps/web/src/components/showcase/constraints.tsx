import { useState } from "react"
import {
  RangeSlider,
  defaultRangeSliderState,
  rangeSliderValue,
  type RangeSliderState,
} from "@workspace/ui/components/constraints/range-slider"
import { PinnableTrack, type TrackedValue } from "@workspace/ui/components/constraints/pinnable-track"
import { CompactSlider } from "@workspace/ui/components/tweak/compact-slider"
import { CommitHandle } from "@workspace/ui/components/constraints/commit-handle"
import { RangeFeasibility } from "@workspace/ui/components/constraints/range-feasibility"
import { AreaViz } from "@workspace/ui/components/viz/area-viz"
import { CappedBar } from "@workspace/ui/components/viz/capped-bar"
import { CurveViz } from "@workspace/ui/components/viz/curve-viz"
import { SegmentViz } from "@workspace/ui/components/viz/segment-viz"
import { NodeDiagram } from "@workspace/ui/components/graph/node-diagram"
import { DataPeek } from "@workspace/ui/components/constraints/data-peek"
import { ConflictMark } from "@workspace/ui/components/constraints/conflict-mark"
import { Exhibit } from "@/components/showcase/exhibit"
import type { Range } from "@workspace/ui/lib/range"

export function ConstraintsShowcase() {
  // RangeSlider — split it to see two independently-set bounds; drag the lo
  // handle past hi (or vice versa) to put it in conflict.
  const [budget, setBudget] = useState<RangeSliderState>(() => defaultRangeSliderState(50))
  const budgetValue = rangeSliderValue(budget)
  const budgetConflicting = budgetValue != null && budgetValue.lo > budgetValue.hi

  // PinnableTrack — toggle the pin to switch between "derived" (display-only)
  // and "pinned" (draggable) states.
  const [pinned, setPinned] = useState(false)
  const [pinnedValue, setPinnedValue] = useState(40)
  const trackedValue: TrackedValue = {
    id: "demo",
    label: "Threshold",
    value: { lo: pinnedValue, hi: pinnedValue },
    domain: [0, 100],
    min: 0,
    max: 100,
    step: 1,
    status: pinned ? "pinned" : "derived",
    pinned,
    pinnable: true,
    pinnedValue,
    onChange: setPinnedValue,
    onPin: setPinned,
  }

  // AreaViz — drag the right/bottom edges to pin x / y.
  const [areaX, setAreaX] = useState(6)
  const [areaY, setAreaY] = useState(4)
  const xRange: Range = { lo: areaX, hi: areaX }
  const yRange: Range = { lo: areaY, hi: areaY }
  const areaRange: Range = { lo: areaX * areaY, hi: areaX * areaY }

  // CappedBar — y = clamp(x, 30, 70). Slide x to see y stop at the wall.
  const [clampX, setClampX] = useState(50)
  const clampedY = Math.max(30, Math.min(70, clampX))

  // CurveViz — a small lookup table.
  const curve: Array<[number, number]> = [[0, 5], [25, 40], [50, 35], [75, 70], [100, 60]]
  const [curveX, setCurveX] = useState(50)
  const curveY = interpolate(curve, curveX)

  // SegmentViz — three parts of a shared total.
  const segmentParts = [
    { label: "rent", value: { lo: 1800, hi: 1800 }, status: "pinned" as const },
    { label: "food", value: { lo: 400, hi: 700 }, status: "bounded" as const },
    { label: "other", value: { lo: 0, hi: 900 }, status: "free" as const },
  ]

  // Range Feasibility — drag the cap below the committed value to create a
  // conflict (red), drag it back above to resolve — a drag-to-violate /
  // drag-back-to-resolve interaction.
  const [feasibilityCap, setFeasibilityCap] = useState(70)
  const [committedValue, setCommittedValue] = useState<number | undefined>(50)
  const inConflict = committedValue != null && committedValue > feasibilityCap

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
      <Exhibit title="Range Slider" subtitle="split into two independently-set bounds" installName="range-slider">
        <RangeSlider
          label="Budget"
          min={0}
          max={100}
          step={1}
          domain={[0, 100]}
          derived={{ lo: 20, hi: 80 }}
          conflicting={budgetConflicting}
          feasible={budgetConflicting ? { lo: 0, hi: budgetValue!.hi } : undefined}
          state={budget}
          onChange={setBudget}
        />
      </Exhibit>

      <Exhibit title="Pinnable Track" subtitle="toggle pin to make it draggable" installName="pinnable-track">
        <PinnableTrack.Row value={trackedValue} />
      </Exhibit>

      <Exhibit title="Area Viz" subtitle="area = x · y, drag the edges" installName="area-viz">
        <AreaViz
          x={{ value: xRange, status: "pinned" }}
          y={{ value: yRange, status: "pinned" }}
          area={{ value: areaRange, status: "derived" }}
          maxX={10}
          maxY={10}
          onPinX={(v) => setAreaX(Math.round(v))}
          onPinY={(v) => setAreaY(Math.round(v))}
        />
      </Exhibit>

      <Exhibit title="Capped Bar" subtitle="y = clamp(x, 30, 70)" installName="capped-bar">
        <div className="flex flex-col gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={clampX}
            onChange={(e) => setClampX(Number(e.target.value))}
            className="w-full"
          />
          <CappedBar
            x={{ value: { lo: clampX, hi: clampX }, status: "pinned" }}
            y={{ value: { lo: clampedY, hi: clampedY }, status: "derived" }}
            lo={30}
            hi={70}
            max={100}
          />
        </div>
      </Exhibit>

      <Exhibit title="Curve Viz" subtitle="y = f(x, lookup table)" installName="curve-viz">
        <div className="flex flex-col gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={curveX}
            onChange={(e) => setCurveX(Number(e.target.value))}
            className="w-full"
          />
          <CurveViz
            x={{ value: { lo: curveX, hi: curveX }, status: "pinned" }}
            y={{ value: { lo: curveY, hi: curveY }, status: "derived" }}
            curve={curve}
          />
        </div>
      </Exhibit>

      <Exhibit title="Segment Viz" subtitle="total = sum(parts)" installName="segment-viz">
        <SegmentViz
          total={{ value: { lo: 2200, hi: 3400 }, status: "bounded" }}
          parts={segmentParts}
          max={3400}
        />
      </Exhibit>

      <Exhibit title="Node Diagram" subtitle="small relation network" installName="node-diagram">
        <NodeDiagram
          nodes={[
            { id: "a", label: "a", status: "pinned" },
            { id: "b", label: "b", status: "pinned" },
            { id: "c", label: "c", status: "derived" },
          ]}
          relations={[{ symbol: "+", nodes: ["c", "a", "b"] }]}
        />
      </Exhibit>

      <Exhibit title="Conflict Mark + Data Peek" subtitle="raw-state escape hatch">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Asserted value:</span>
            <ConflictMark conflicting isOrigin>
              42
            </ConflictMark>
          </div>
          <DataPeek
            summary="Demo readout"
            rows={[
              { id: "a", label: "a", status: "pinned", value: "12" },
              { id: "b", label: "b", status: "pinned", value: "8" },
              { id: "c", label: "c", status: "derived", value: "20" },
            ]}
          />
        </div>
      </Exhibit>

      <Exhibit title="Range Feasibility" subtitle="drag the cap below the pin to conflict">
        <div className="flex flex-col gap-3">
          <CompactSlider label="Cap" value={feasibilityCap} onChange={setFeasibilityCap} min={0} max={100} step={1} format={(v) => v.toFixed(0)} />
          <RangeFeasibility.Root domain={[0, 100]}>
            <RangeFeasibility.Label>Value</RangeFeasibility.Label>
            <RangeFeasibility.Track>
              {inConflict && committedValue != null && (
                <RangeFeasibility.Zone variant="invalid" lo={feasibilityCap} hi={committedValue} />
              )}
              <RangeFeasibility.Zone variant="valid" lo={0} hi={feasibilityCap} />
              <CommitHandle
                lo={0}
                hi={100}
                domain={[0, 100]}
                committed={committedValue}
                onCommit={setCommittedValue}
                onClear={() => setCommittedValue(undefined)}
              />
            </RangeFeasibility.Track>
            <RangeFeasibility.Readout lo={inConflict ? undefined : 0} hi={inConflict ? undefined : feasibilityCap} />
          </RangeFeasibility.Root>
        </div>
      </Exhibit>
    </div>
  )
}

function interpolate(curve: Array<[number, number]>, x: number): number {
  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, y0] = curve[i]!
    const [x1, y1] = curve[i + 1]!
    if (x >= x0 && x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return curve[curve.length - 1]?.[1] ?? 0
}
