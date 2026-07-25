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

import { getSession, requireSession } from "./auth/session"
import { rejectCrossOrigin } from "./same-origin.server"

/** Upper bound on one dictation capture. Matches the conventional upload
 *  ceiling for OpenAI-compatible transcription endpoints; an unbounded body
 *  would let one request hold the STT backend, and the browser, for minutes. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

async function readAudioFile(request: Request): Promise<File | undefined> {
  try {
    const form = await request.formData()
    const file = form.get("audio")
    if (!(file instanceof File)) return undefined
    return file.size > 0 ? file : undefined
  } catch {
    return undefined
  }
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

  const file = await readAudioFile(request)
  if (!file) return new Response(null, { status: 400 })
  if (file.size > MAX_AUDIO_BYTES) {
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
    upstreamForm.set("file", file, file.name || "dictation.webm")
    upstreamForm.set("model", voice.stt.model)

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

    const result = (await upstream.json()) as { text?: unknown }
    const text = typeof result.text === "string" ? result.text : ""
    return new Response(JSON.stringify({ text }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
