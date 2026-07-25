import { describe, expect, it } from "vitest"

import {
  EMPTY_PROGRESS,
  PROGRESS_BOUNDS,
  currentProgressLine,
  projectProgress,
  type ProgressProjection,
  type ProgressUpdate,
} from "./coordinator-progress"

const START = 1_000

/** Fold a script of updates, so each test states only the timeline it cares
 *  about. Bounds come from PROGRESS_BOUNDS, never from a literal. */
function fold(
  updates: readonly ProgressUpdate[],
  from: ProgressProjection = EMPTY_PROGRESS,
): ProgressProjection {
  return updates.reduce(
    (projection, update) => projectProgress(projection, update),
    from,
  )
}

function progress(text: string, at: number): ProgressUpdate {
  return { kind: "progress", text, at }
}

function final(text: string, at: number): ProgressUpdate {
  return { kind: "final", text, at }
}

describe("projectProgress", () => {
  it("coalesces updates arriving inside the window into one line", () => {
    const burst = ["reading", "reading files", "reading 12 files"].map(
      (text, index) =>
        progress(text, START + index * (PROGRESS_BOUNDS.coalesceWindowMs - 1)),
    )
    // Each step is inside the window relative to the one before it, so the
    // whole burst collapses onto a single moving line.
    const projection = fold(burst)

    expect(projection.narration).toHaveLength(1)
    expect(currentProgressLine(projection)).toBe("reading 12 files")
  })

  it("appends a line once the window has elapsed", () => {
    const projection = fold([
      progress("reading", START),
      progress("summarizing", START + PROGRESS_BOUNDS.coalesceWindowMs),
    ])

    expect(projection.narration.map((line) => line.text)).toEqual([
      "reading",
      "summarizing",
    ])
  })

  it("retains no more than the bounded number of lines", () => {
    const overflow = PROGRESS_BOUNDS.maxLines + 2
    const projection = fold(
      Array.from({ length: overflow }, (_, index) =>
        progress(
          `step ${index}`,
          START + index * PROGRESS_BOUNDS.coalesceWindowMs,
        ),
      ),
    )

    expect(projection.narration).toHaveLength(PROGRESS_BOUNDS.maxLines)
    // The oldest fell off; the newest survived.
    expect(projection.narration[0]?.text).toBe(
      `step ${overflow - PROGRESS_BOUNDS.maxLines}`,
    )
    expect(currentProgressLine(projection)).toBe(`step ${overflow - 1}`)
  })

  it("lets a final result supersede the narration that preceded it", () => {
    const projection = fold([
      progress("searching the repository", START),
      progress("reading matches", START + PROGRESS_BOUNDS.coalesceWindowMs),
      final("Found it in three files.", START + 5_000),
    ])

    expect(projection.narration).toEqual([])
    expect(currentProgressLine(projection)).toBe("Found it in three files.")
  })

  it("ignores intermediate narration observed before the final it follows", () => {
    const answered = fold([final("Answer.", START + 100)])
    const stale = projectProgress(answered, progress("still searching", START))

    expect(stale).toEqual(answered)
    expect(currentProgressLine(stale)).toBe("Answer.")
  })

  it("yields to genuinely newer narration once the answer is delivered", () => {
    const answered = fold([final("Answer.", START)])
    const next = projectProgress(answered, progress("following up", START + 1))

    // The answer stays in the transcript; this projection is only what is live.
    expect(next.final).toBeUndefined()
    expect(currentProgressLine(next)).toBe("following up")
  })

  it("ignores an out-of-order final older than the one already projected", () => {
    const answered = fold([final("Newer answer.", START + 100)])
    const older = projectProgress(answered, final("Older answer.", START))

    expect(older).toEqual(answered)
  })

  it("projects no line for whitespace-only updates", () => {
    expect(fold([progress("   ", START)])).toEqual(EMPTY_PROGRESS)
    expect(fold([final("\n", START)])).toEqual(EMPTY_PROGRESS)
  })
})
