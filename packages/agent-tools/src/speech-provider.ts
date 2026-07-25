// Speech synthesis backend for the `sigil-synthesize-speech` application tool.
//
// Speaks the same Gonk voice-tts contract as the web app's read-aloud route —
// POST {baseURL}/audio/speech — against whatever provider
// @workspace/runtime-env/voice resolves. Which endpoint is a deployment
// decision made there; this module never chooses one. The difference from the
// read-aloud path is that voice, format, and speed are per-call parameters
// here: the agent is synthesizing a deliberate performance, not narrating its
// own reply in the deployment's default voice.
//
// Credential containment is a hard requirement, not a nicety. Every failure
// below produces a message built from constants only. The base URL and API key
// are in scope throughout this file and must never reach a thrown message,
// because a tool error is transcript text the model reads back to the user.

import { ToolError } from "@gonk/tool-registry";
import {
  applyVoiceConversion,
  readVoiceEnvironment,
  resolveTtsConfig,
} from "@workspace/runtime-env/voice";
import type {
  PersonaVoiceConfig,
  TtsProviderConfig,
  VoiceConverter,
} from "@workspace/runtime-env/voice";
import type { RuntimeEnvironment } from "@workspace/runtime-env/topology";

export const SPEECH_FORMATS = [
  "mp3",
  "opus",
  "aac",
  "wav",
  "flac",
  "pcm",
] as const;

export type SpeechFormat = (typeof SPEECH_FORMATS)[number];

// The tool's advertised format list and the provider config's format union are
// the same constraint surface. Assert both directions so adding a format in
// runtime-env without adding it here (or the reverse) fails typecheck instead
// of silently advertising a format the provider cannot produce.
type FormatsMatch =
  [SpeechFormat] extends [TtsProviderConfig["format"]]
    ? [TtsProviderConfig["format"]] extends [SpeechFormat]
      ? true
      : never
    : never;
const _formatsMatchProviderConfig: FormatsMatch = true;
void _formatsMatchProviderConfig;

export const SPEECH_MEDIA_TYPES: Record<SpeechFormat, string> = {
  mp3: "audio/mpeg",
  opus: "audio/opus",
  aac: "audio/aac",
  wav: "audio/wav",
  flac: "audio/flac",
  pcm: "audio/pcm",
};

/** One synthesis response has to fit in memory before it becomes an artifact.
 *  Bounded text cannot legitimately produce more audio than this. */
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;

export interface SpeechSynthesisRequest {
  readonly text: string;
  readonly voice?: string;
  readonly format?: SpeechFormat;
  readonly speed?: number;
  readonly personaVoice?: PersonaVoiceConfig;
  readonly converter?: VoiceConverter;
  readonly signal: AbortSignal;
  readonly env: RuntimeEnvironment;
}

export interface SpeechSynthesisResult {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly voice: string;
  readonly format: SpeechFormat;
  readonly model: string;
}

export type SpeechSynthesisProvider = (
  request: SpeechSynthesisRequest,
) => Promise<SpeechSynthesisResult>;

export const synthesizeThroughVoiceProvider: SpeechSynthesisProvider = async (
  request,
) => {
  let tts: TtsProviderConfig;
  try {
    tts = resolveTtsConfig(
      readVoiceEnvironment(request.env).tts,
      request.personaVoice,
    );
  } catch {
    // RuntimeEnvironmentError messages quote the offending value, which for a
    // base-URL or key variable is exactly what must not surface.
    throw new ToolError(
      "TTS_UNCONFIGURED",
      "The speech provider is not configured correctly for this deployment. No audio was produced.",
    );
  }

  const voice = request.voice ?? tts.voice;
  const format = request.format ?? tts.format;
  const speed = request.speed ?? tts.speed;

  let response: Response;
  try {
    response = await fetch(`${tts.baseURL}/audio/speech`, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(tts.apiKey ? { Authorization: `Bearer ${tts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: tts.model,
        voice,
        input: request.text,
        response_format: format,
        ...(speed === undefined ? {} : { speed }),
        ...(tts.style === undefined ? {} : { style: tts.style }),
      }),
      signal: request.signal,
    });
  } catch {
    throw unavailable();
  }

  if (!response.ok) {
    // Status only. An upstream error body can echo the request URL or a
    // provider-side key hint, so it is never forwarded.
    throw new ToolError(
      "TTS_REJECTED",
      `The speech provider rejected the request (HTTP ${response.status}). No audio was produced.`,
    );
  }

  const bytes = await readAudioBytes(response);
  if (bytes.byteLength === 0) {
    throw new ToolError(
      "TTS_EMPTY",
      "The speech provider returned no audio for this text.",
    );
  }

  const upstreamMediaType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const mediaType = upstreamMediaType?.startsWith("audio/")
    ? upstreamMediaType
    : SPEECH_MEDIA_TYPES[format];
  const converted = await applyVoiceConversion(
    {
      bytes,
      inputFormat: format,
      inputMediaType: mediaType,
      conversion: tts.conversion,
      signal: request.signal,
    },
    request.converter,
  );

  return {
    bytes: converted.bytes,
    mediaType: converted.mediaType,
    voice,
    format: converted.converted ? tts.conversion!.format : format,
    model: tts.model,
  };
};

async function readAudioBytes(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
    throw oversized();
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw oversized();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function unavailable(): ToolError {
  return new ToolError(
    "TTS_UNAVAILABLE",
    "The speech provider is unavailable. No audio was produced.",
  );
}

function oversized(): ToolError {
  return new ToolError(
    "TTS_OVERSIZED",
    `The speech provider returned more than ${MAX_AUDIO_BYTES / 1024 / 1024} MiB of audio.`,
  );
}
