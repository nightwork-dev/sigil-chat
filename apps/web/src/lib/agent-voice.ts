// Client half of TTS: turn a message's parts into audio, or into silence.
//
// The degrade-to-text contract lives here. Speech is a delivery surface
// layered over the authoritative text transcript, so a synth failure must
// never surface as a broken message — the worst outcome is that nothing is
// spoken. Accordingly `speakMessageParts` NEVER throws: every failure mode
// (projection empty, network down, non-OK status, empty audio) collapses to a
// status the caller can ignore, and the chat surface renders exactly as if
// voice did not exist.

import type { AgentMessagePart } from "@zigil/agent"

import { AGENT_PERSONA_HEADER } from "./agent-session-scope"
import { speakableText, type SpeakableOptions } from "./speakable-text"

export type SpeakOutcome =
  /** Audio synthesized; the caller decides when to play it. */
  | { readonly status: "spoken"; readonly audio: Blob }
  /** The message projected to no speakable text — synth was never attempted. */
  | { readonly status: "nothing-to-say" }
  /** Synthesis failed; the text transcript is the fallback, silently. */
  | { readonly status: "failed" }

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

/**
 * Synthesize one utterance via the same-origin voice route.
 * Returns undefined on ANY failure — this function never throws.
 */
export async function synthesizeSpeech(
  text: string,
  fetchImpl: FetchLike = fetch,
  personaId?: string,
): Promise<Blob | undefined> {
  try {
    const response = await fetchImpl("/api/voice/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(personaId ? { [AGENT_PERSONA_HEADER]: personaId } : {}),
      },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) return undefined
    const audio = await response.blob()
    return audio.size > 0 ? audio : undefined
  } catch {
    return undefined
  }
}

/**
 * Project a message's parts to speakable text and synthesize it.
 * Never throws; a failure leaves the rendered message untouched.
 */
export async function speakMessageParts(
  parts: readonly AgentMessagePart[],
  options: SpeakableOptions = {},
  fetchImpl: FetchLike = fetch,
  personaId?: string,
): Promise<SpeakOutcome> {
  const text = speakableText(parts, options)
  if (!text) return { status: "nothing-to-say" }

  const audio = await synthesizeSpeech(text, fetchImpl, personaId)
  return audio ? { status: "spoken", audio } : { status: "failed" }
}
