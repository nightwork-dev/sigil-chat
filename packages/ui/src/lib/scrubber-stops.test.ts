// Pure stop/zone math behind <TimeScrubber> — ordering, the snap-to-nearest
// rule, pointer geometry, stop-by-stop keyboard navigation, and zone
// description. The component is a thin render layer; locking these in node
// (per the repo's extract-the-math convention) is what guarantees no input
// path ever fabricates a value between two attested stops.

import { describe, expect, it } from "vitest";

import {
  clamp01,
  describeZones,
  firstStopId,
  lastStopId,
  nextStopId,
  normalizeStopExtent,
  pointerToPosition,
  prevStopId,
  resolveStopIndex,
  snapToNearestStop,
  sortStops,
  type ScrubberStop,
} from "../lib/scrubber-stops";

const STOP = (id: string, position: number, label = id): ScrubberStop => ({
  id,
  position,
  label,
});

describe("clamp01", () => {
  it("passes through in-range values and clamps out-of-range", () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });
  it("maps NaN to 0", () => {
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe("sortStops", () => {
  it("orders stops ascending by position", () => {
    const out = sortStops([STOP("c", 0.8), STOP("a", 0.1), STOP("b", 0.5)]);
    expect(out.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
  it("is stable on ties (input order preserved)", () => {
    const out = sortStops([STOP("first", 0.5), STOP("second", 0.5)]);
    expect(out.map((s) => s.id)).toEqual(["first", "second"]);
  });
  it("does not mutate the input", () => {
    const input = [STOP("b", 0.9), STOP("a", 0.1)];
    sortStops(input);
    expect(input.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("resolveStopIndex", () => {
  it("finds the index of a stop by id", () => {
    expect(resolveStopIndex([STOP("a", 0), STOP("b", 1)], "b")).toBe(1);
  });
  it("returns -1 for null/undefined/unknown id", () => {
    expect(resolveStopIndex([STOP("a", 0)], null)).toBe(-1);
    expect(resolveStopIndex([STOP("a", 0)], undefined)).toBe(-1);
    expect(resolveStopIndex([STOP("a", 0)], "gone")).toBe(-1);
  });
});

describe("snapToNearestStop — between stops is never a value", () => {
  const stops = [STOP("a", 0), STOP("b", 0.5), STOP("c", 1)];
  it("snaps to the nearest stop", () => {
    expect(snapToNearestStop(0.1, stops)?.id).toBe("a");
    expect(snapToNearestStop(0.4, stops)?.id).toBe("b");
    expect(snapToNearestStop(0.9, stops)?.id).toBe("c");
  });
  it("snaps exactly at a stop to that stop", () => {
    expect(snapToNearestStop(0.5, stops)?.id).toBe("b");
  });
  it("resolves a tie to the lower-position stop (deterministic, no oscillation)", () => {
    // 0.25 is equidistant from a(0) and b(0.5) → a wins (lower position).
    expect(snapToNearestStop(0.25, stops)?.id).toBe("a");
    // 0.75 is equidistant from b(0.5) and c(1) → b wins.
    expect(snapToNearestStop(0.75, stops)?.id).toBe("b");
  });
  it("clamps an out-of-range pointer before snapping", () => {
    expect(snapToNearestStop(-1, stops)?.id).toBe("a");
    expect(snapToNearestStop(2, stops)?.id).toBe("c");
  });
  it("returns undefined for an empty stop set (no fabricated value)", () => {
    expect(snapToNearestStop(0.5, [])).toBeUndefined();
  });
  it("always returns a real stop id, never a position between two stops", () => {
    const ids = new Set(stops.map((s) => s.id));
    for (let p = 0; p <= 1; p += 0.01) {
      const snapped = snapToNearestStop(p, stops);
      expect(snapped).toBeDefined();
      expect(ids.has(snapped!.id)).toBe(true);
    }
  });
});

describe("keyboard navigation — step stop-by-stop", () => {
  const stops = [STOP("a", 0), STOP("b", 0.5), STOP("c", 1)];
  it("nextStopId advances one stop", () => {
    expect(nextStopId(stops, "a")).toBe("b");
    expect(nextStopId(stops, "b")).toBe("c");
  });
  it("nextStopId returns null at the last edge", () => {
    expect(nextStopId(stops, "c")).toBeNull();
  });
  it("prevStopId retreats one stop", () => {
    expect(prevStopId(stops, "c")).toBe("b");
    expect(prevStopId(stops, "b")).toBe("a");
  });
  it("prevStopId returns null at the first edge", () => {
    expect(prevStopId(stops, "a")).toBeNull();
  });
  it("returns null for an unknown current id", () => {
    expect(nextStopId(stops, "gone")).toBeNull();
    expect(prevStopId(stops, "gone")).toBeNull();
  });
  it("returns null for an empty set", () => {
    expect(nextStopId([], "a")).toBeNull();
    expect(prevStopId([], "a")).toBeNull();
  });
});

describe("firstStopId / lastStopId", () => {
  it("returns the first and last stop ids", () => {
    const stops = [STOP("a", 0), STOP("b", 0.5), STOP("c", 1)];
    expect(firstStopId(stops)).toBe("a");
    expect(lastStopId(stops)).toBe("c");
  });
  it("returns null for an empty set", () => {
    expect(firstStopId([])).toBeNull();
    expect(lastStopId([])).toBeNull();
  });
});

describe("pointerToPosition", () => {
  it("maps a clientX at the track edges to 0/1", () => {
    expect(pointerToPosition(10, 10, 100)).toBe(0);
    expect(pointerToPosition(110, 10, 100)).toBe(1);
  });
  it("maps the track midpoint to 0.5", () => {
    expect(pointerToPosition(60, 10, 100)).toBe(0.5);
  });
  it("clamps a pointer outside the track into [0,1]", () => {
    expect(pointerToPosition(0, 10, 100)).toBe(0);
    expect(pointerToPosition(500, 10, 100)).toBe(1);
  });
  it("degrades to 0 for a zero/negative-width track (no divide-by-zero)", () => {
    expect(pointerToPosition(50, 10, 0)).toBe(0);
    expect(pointerToPosition(50, 10, -5)).toBe(0);
  });
});

describe("describeZones — accessible description", () => {
  it("is empty when there are no zones", () => {
    expect(describeZones([])).toBe("");
  });
  it("uses the singular form for one zone", () => {
    expect(describeZones([{ start: 0.2, end: 0.4 }])).toBe(
      "1 indeterminate span on the track",
    );
  });
  it("uses the plural form for several zones", () => {
    expect(
      describeZones([
        { start: 0, end: 0.1 },
        { start: 0.5, end: 0.6 },
        { start: 0.9, end: 1 },
      ]),
    ).toBe("3 indeterminate spans on the track");
  });
});

describe("normalizeStopExtent", () => {
  it("clamps and orders a selected extent", () => {
    expect(
      normalizeStopExtent({ start: 1.2, end: -0.2, softStart: true }),
    ).toEqual({
      start: 0,
      end: 1,
      softStart: true,
      softEnd: false,
    });
  });

  it("returns null for absent or point-like extents", () => {
    expect(normalizeStopExtent(undefined)).toBeNull();
    expect(normalizeStopExtent({ start: 0.4, end: 0.4 })).toBeNull();
  });
});
