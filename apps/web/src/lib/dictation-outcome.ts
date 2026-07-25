// What a finished dictation should DO — nothing more.
//
// Dictation defaults to an editable DRAFT, never an auto-send. A transcript
// is a guess: background noise, a mumbled word, or a mid-sentence pause can
// all turn "remind me to call mom" into something the user never said, and
// the one place that error is cheap to catch is before it leaves the
// composer. Auto-send is therefore never the ambient behavior — it exists
// only behind an explicit `voiceFirst: true` opt-in the caller must pass on
// purpose, per turn or per session, never inferred from context.
//
// This module is pure: no DOM, no fetch, no side effects. It exists so the
// send-vs-draft decision can be unit tested without a UI in the loop.

export type DictationOutcome =
  /** Nothing was said, or the transcript was whitespace — no-op. */
  | { readonly kind: "noop" }
  /** Default outcome: hand the text to the composer for the user to edit. */
  | { readonly kind: "draft"; readonly text: string }
  /** Only when voiceFirst is explicitly true: send immediately. */
  | { readonly kind: "send"; readonly text: string }

export interface DictationOutcomeOptions {
  /** Explicit opt-in to auto-send. Any value other than `true` (including
   *  `false` and `undefined`) keeps the safer draft behavior. */
  readonly voiceFirst?: boolean
}

export function dictationOutcome(
  transcription: string | undefined,
  options: DictationOutcomeOptions = {},
): DictationOutcome {
  const text = transcription?.trim()
  if (!text) return { kind: "noop" }
  return options.voiceFirst === true
    ? { kind: "send", text }
    : { kind: "draft", text }
}
