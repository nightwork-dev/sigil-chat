/**
 * Advisory speaker attribution returned by a diarizing STT provider.
 *
 * A speaker label is not authentication: this type deliberately carries no
 * principal, role, or scope field and must never be used for authorization.
 * Multi-party transcript presentation is intentionally left to the UI owner.
 */
export interface DiarizedTranscriptSegment {
  readonly speaker: string
  readonly text: string
  readonly start: number
  readonly end: number
}

export interface DiarizedTranscriptTurn {
  readonly speaker: string
  readonly text: string
  readonly start: number
  readonly end: number
}

export type TranscriptionResult =
  | {
      readonly text: string
    }
  | {
      readonly text: string
      readonly diarization: "unavailable"
    }
  | {
      readonly text: string
      readonly segments: readonly DiarizedTranscriptSegment[]
    }

/**
 * Groups adjacent segments from the same advisory speaker into readable turns.
 * It does not infer identity and never adds authentication or authorization
 * data.
 */
export function mergeDiarizedSegments(
  segments: readonly DiarizedTranscriptSegment[],
): DiarizedTranscriptTurn[] {
  const turns: DiarizedTranscriptTurn[] = []

  for (const segment of segments) {
    const previous = turns.at(-1)
    if (previous?.speaker === segment.speaker) {
      turns[turns.length - 1] = {
        speaker: previous.speaker,
        text: [previous.text, segment.text].filter(Boolean).join(" "),
        start: previous.start,
        end: segment.end,
      }
      continue
    }

    turns.push({ ...segment })
  }

  return turns
}
