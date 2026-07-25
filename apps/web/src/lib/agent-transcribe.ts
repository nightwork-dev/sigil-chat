// Client half of STT: turn a recorded audio blob into transcribed text, or
// into nothing.
//
// Same degrade contract as synthesizeSpeech (agent-voice.ts): dictation is a
// convenience input surface, not the only way to compose a message, so a
// transcription failure must never surface as a broken interaction.
// `transcribeAudio` NEVER throws — every failure mode (network down,
// non-OK status, malformed response) collapses to undefined, and the caller
// treats it exactly as if dictation had not been attempted.

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

/**
 * Transcribe one recorded utterance via the same-origin voice route.
 * Returns undefined on ANY failure — this function never throws.
 */
export async function transcribeAudio(
  audio: Blob,
  fetchImpl: FetchLike = fetch,
): Promise<string | undefined> {
  try {
    const form = new FormData()
    form.set("audio", audio, "dictation.webm")

    const response = await fetchImpl("/api/voice/transcribe", {
      method: "POST",
      body: form,
    } as RequestInit)
    if (!response.ok) return undefined

    const result = (await response.json()) as { text?: unknown }
    if (typeof result.text !== "string") return undefined
    const trimmed = result.text.trim()
    return trimmed.length > 0 ? trimmed : undefined
  } catch {
    return undefined
  }
}
