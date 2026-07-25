import type { DiarizedTranscriptSegment } from "./agent-transcription"

export const DIARIZED_SEGMENTS_FIXTURE = [
  { speaker: "speaker-a", text: "Good morning.", start: 0, end: 0.9 },
  { speaker: "speaker-a", text: "Ready to begin?", start: 1, end: 2.1 },
  { speaker: "speaker-b", text: "Yes.", start: 2.3, end: 2.8 },
  { speaker: "speaker-a", text: "First item.", start: 3, end: 3.8 },
] as const satisfies readonly DiarizedTranscriptSegment[]
