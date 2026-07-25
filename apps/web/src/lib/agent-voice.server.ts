// TTS synthesis: the server half of "speak agent replies".
//
// Speaks the Gonk voice-tts contract — POST {baseURL}/audio/speech — against
// whatever provider the runtime-env voice profile resolves (Kokoro on the
// server profile, Gonk's MLX stack on local-mac, or any remote
// OpenAI-compatible endpoint). Which endpoint is a deployment decision made in
// @workspace/runtime-env/voice; this module never chooses.
//
// The provider credential (if any) stays server-side: the browser sends text
// to this same-origin route and gets audio back, and never learns the
// upstream URL or key.
//
// Degrade-to-text contract: every failure past authentication maps to a plain
// error status, never a thrown exception, so the client helper can treat any
// non-OK response as "stay silent" and the chat surface renders unaffected.

import {
  readVoiceEnvironment,
  type VoiceRuntimeEnvironment,
} from "@workspace/runtime-env/voice"
import type { RuntimeEnvironment } from "@workspace/runtime-env/topology"

import { getSession, requireSession } from "./auth/session"
import { rejectCrossOrigin } from "./same-origin.server"

/** Upper bound on one utterance. Speakable text is a projection of a chat
 *  message, not a document; anything past this is a caller bug, and an
 *  unbounded body would let one request hold the synth backend for minutes. */
export const MAX_SPEAKABLE_LENGTH = 4000

const FORMAT_CONTENT_TYPES: Record<
  VoiceRuntimeEnvironment["tts"]["format"],
  string
> = {
  mp3: "audio/mpeg",
  opus: "audio/opus",
  aac: "audio/aac",
  wav: "audio/wav",
  flac: "audio/flac",
  pcm: "audio/pcm",
}

async function readSpeakableText(request: Request): Promise<string | undefined> {
  try {
    const body: unknown = await request.json()
    if (typeof body !== "object" || body === null) return undefined
    const text = (body as { text?: unknown }).text
    if (typeof text !== "string") return undefined
    const trimmed = text.trim()
    return trimmed.length > 0 ? trimmed : undefined
  } catch {
    return undefined
  }
}

export async function synthesizeSpeechFromRequest(
  request: Request,
  env: RuntimeEnvironment = process.env,
): Promise<Response> {
  // JSON POSTs are preflight-protected, so this is defence in depth here;
  // the guard exists for the CORS-simple transcribe route and both voice
  // routes behave identically on purpose.
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

  const text = await readSpeakableText(request)
  if (!text) return new Response(null, { status: 400 })
  if (text.length > MAX_SPEAKABLE_LENGTH) {
    return new Response(null, { status: 413 })
  }

  let voice: VoiceRuntimeEnvironment
  try {
    voice = readVoiceEnvironment(env)
  } catch {
    // Misconfiguration, not a transient synth failure — but the client's
    // degrade path is the same either way: stay silent, keep the text.
    return new Response(null, { status: 500 })
  }

  try {
    const upstream = await fetch(`${voice.tts.baseURL}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(voice.tts.apiKey
          ? { Authorization: `Bearer ${voice.tts.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: voice.tts.model,
        voice: voice.tts.voice,
        input: text,
        response_format: voice.tts.format,
      }),
    })
    if (!upstream.ok) return new Response(null, { status: 502 })

    const audio = await upstream.arrayBuffer()
    return new Response(audio, {
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ??
          FORMAT_CONTENT_TYPES[voice.tts.format],
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
