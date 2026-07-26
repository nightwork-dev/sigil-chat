import { describe, expect, it } from "vitest"

import { DIARIZED_SEGMENTS_FIXTURE } from "./agent-transcription.test-fixtures"
import {
  mergeDiarizedSegments,
  type DiarizedTranscriptSegment,
} from "./agent-transcription"

describe("mergeDiarizedSegments", () => {
  it("groups consecutive same-speaker segments into turns", () => {
    const turns = mergeDiarizedSegments(DIARIZED_SEGMENTS_FIXTURE)
    const expectedTurnCount = DIARIZED_SEGMENTS_FIXTURE.reduce(
      (count, segment, index, fixture) =>
        index === 0 || fixture[index - 1]?.speaker !== segment.speaker
          ? count + 1
          : count,
      0,
    )

    expect(turns).toHaveLength(expectedTurnCount)
    expect(turns[0]).toEqual({
      speaker: DIARIZED_SEGMENTS_FIXTURE[0].speaker,
      text: [
        DIARIZED_SEGMENTS_FIXTURE[0].text,
        DIARIZED_SEGMENTS_FIXTURE[1].text,
      ].join(" "),
      start: DIARIZED_SEGMENTS_FIXTURE[0].start,
      end: DIARIZED_SEGMENTS_FIXTURE[1].end,
    })
  })

  it("never turns advisory speaker labels into authorization data", () => {
    type ForbiddenAuthFields = Extract<
      keyof DiarizedTranscriptSegment,
      "principal" | "scope"
    >
    const noAuthFieldCanExist: ForbiddenAuthFields[] = []
    const turns = mergeDiarizedSegments(DIARIZED_SEGMENTS_FIXTURE)

    expect(noAuthFieldCanExist).toEqual([])
    for (const turn of turns) {
      expect(turn).not.toHaveProperty("principal")
      expect(turn).not.toHaveProperty("scope")
    }
  })
})
