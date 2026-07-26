// STT transcription: the server half of "dictation produces an editable draft".
//
// Speaks the Gonk voice-stt contract — POST {baseURL}/audio/transcriptions —
// against whatever provider the runtime-env voice profile resolves (Kokoro on
// the server profile, Gonk's MLX stack on local-mac, or any remote
// OpenAI-compatible endpoint). Which endpoint is a deployment decision made in
// @workspace/runtime-env/voice; this module never chooses.
//
// The provider credential (if any) stays server-side: the browser sends a
// recorded audio blob to this same-origin route and gets text back, and never
// learns the upstream URL or key.
//
// Degrade contract mirrors synthesizeSpeechFromRequest: every failure past
// authentication maps to a plain error status, never a thrown exception, so
// the client helper can treat any non-OK response as "no transcript".

import {
  readVoiceEnvironment,
  type VoiceRuntimeEnvironment,
} from "@workspace/runtime-env/voice"
import type { RuntimeEnvironment } from "@workspace/runtime-env/topology"

import type {
  DiarizedTranscriptSegment,
  TranscriptionResult,
} from "./agent-transcription"
import { getSession, requireSession } from "./auth/session"
import { rejectCrossOrigin } from "./same-origin.server"

/** Upper bound on one dictation capture. Matches the conventional upload
 *  ceiling for OpenAI-compatible transcription endpoints; an unbounded body
 *  would let one request hold the STT backend, and the browser, for minutes. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

interface TranscriptionRequest {
  readonly file: File
  readonly diarize: boolean
}

async function readTranscriptionRequest(
  request: Request,
): Promise<TranscriptionRequest | undefined> {
  try {
    const form = await request.formData()
    const file = form.get("audio")
    if (!(file instanceof File)) return undefined
    if (file.size === 0) return undefined
    return {
      file,
      diarize: form.get("diarize") === "true",
    }
  } catch {
    return undefined
  }
}

function readDiarizedSegments(
  value: unknown,
): DiarizedTranscriptSegment[] | undefined {
  if (!Array.isArray(value)) return undefined

  const segments: DiarizedTranscriptSegment[] = []
  for (const candidate of value) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("speaker" in candidate) ||
      typeof candidate.speaker !== "string" ||
      !("text" in candidate) ||
      typeof candidate.text !== "string" ||
      !("start" in candidate) ||
      typeof candidate.start !== "number" ||
      !("end" in candidate) ||
      typeof candidate.end !== "number"
    ) {
      return undefined
    }
    segments.push({
      speaker: candidate.speaker,
      text: candidate.text,
      start: candidate.start,
      end: candidate.end,
    })
  }
  return segments
}

export async function transcribeAudioFromRequest(
  request: Request,
  env: RuntimeEnvironment = process.env,
): Promise<Response> {
  // Multipart POSTs are CORS-simple (no preflight), so a hostile page could
  // otherwise spend the user's session against the STT backend.
  const crossOrigin = rejectCrossOrigin(request)
  if (crossOrigin) return crossOrigin

  const session = await getSession(request.headers)
  try {
    requireSession(session)
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? (error as { status: number }).status
        : 403
    return new Response(null, { status })
  }

  const transcriptionRequest = await readTranscriptionRequest(request)
  if (!transcriptionRequest) return new Response(null, { status: 400 })
  if (transcriptionRequest.file.size > MAX_AUDIO_BYTES) {
    return new Response(null, { status: 413 })
  }

  let voice: VoiceRuntimeEnvironment
  try {
    voice = readVoiceEnvironment(env)
  } catch {
    // Misconfiguration, not a transient transcription failure — but the
    // client's degrade path is the same either way: no transcript.
    return new Response(null, { status: 500 })
  }

  try {
    const upstreamForm = new FormData()
    upstreamForm.set(
      "file",
      transcriptionRequest.file,
      transcriptionRequest.file.name || "dictation.webm",
    )
    upstreamForm.set("model", voice.stt.model)
    const requestDiarization =
      transcriptionRequest.diarize && voice.stt.diarization
    if (requestDiarization) upstreamForm.set("diarize", "true")

    const upstream = await fetch(`${voice.stt.baseURL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        ...(voice.stt.apiKey
          ? { Authorization: `Bearer ${voice.stt.apiKey}` }
          : {}),
      },
      body: upstreamForm,
    })
    if (!upstream.ok) return new Response(null, { status: 502 })

    const result = (await upstream.json()) as {
      text?: unknown
      segments?: unknown
    }
    const text = typeof result.text === "string" ? result.text : ""
    let response: TranscriptionResult = { text }
    if (transcriptionRequest.diarize) {
      if (!voice.stt.diarization) {
        response = { text, diarization: "unavailable" }
      } else {
        const segments = readDiarizedSegments(result.segments)
        if (!segments) return new Response(null, { status: 502 })
        response = { text, segments }
      }
    }
    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
