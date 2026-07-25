// Voice provider configuration for STT and TTS.
//
// Sigil Chat does NOT own a voice substrate. Gonk does: @gonk/voice-tts and
// @gonk/voice-stt speak the OpenAI-compatible shape (`POST {baseURL}/audio/speech`
// and `POST {baseURL}/audio/transcriptions`). This module only decides WHICH
// endpoint and model those talk to, because that is the part that has to differ
// per deployment.
//
// Why it exists: Gonk's defaults are Apple-Silicon-bound — an `mlx-community/*`
// TTS model on oMLX (:1243) and mlx-audio (:10650). Those are correct on a Mac
// and unusable on a Linux server. The contract is portable; only the defaults
// are not (David, 2026-07-24: "it might be too opinionated towards my M5 mac").
//
// So the profile picks the defaults, and every field stays overridable:
//   - "server"    → Kokoro behind an OpenAI-compatible HTTP server. CPU/ONNX
//                   builds exist, so no Apple Silicon and no GPU required.
//   - "local-mac" → Gonk's MLX defaults, for development on David's machine.
//
// Pointing at a REMOTE OpenAI-compatible endpoint is the same thing as pointing
// at a local one: set the base URL. There is deliberately no third code path.
//
// Optional conversion contract (external service; this package does not host
// or install an inference stack):
//   POST {conversion.baseURL}/convert
//   Content-Type: multipart/form-data
//   fields:
//     audio           binary TTS output, filename `speech.<input format>`
//     model           conversion model id
//     voice           target voice id
//     response_format requested output format
//   response: raw audio bytes, with an optional audio/* Content-Type.
//
// Conversion is fail-open. A rejected, unreachable, empty, or oversized
// conversion response returns the original TTS bytes and media type. Endpoint,
// credential, and upstream response text are never included in an error.

import {
  parseHttpUrl,
  RuntimeEnvironmentError,
  type RuntimeEnvironment,
} from "./topology.js";

export type VoiceProfile = "server" | "local-mac";

export interface VoiceProviderConfig {
  /** OpenAI-compatible base URL, no trailing slash. */
  readonly baseURL: string;
  readonly model: string;
  readonly apiKey: string | undefined;
}

export interface TtsProviderConfig extends VoiceProviderConfig {
  readonly voice: string;
  readonly format: "mp3" | "opus" | "aac" | "wav" | "flac" | "pcm";
  readonly speed?: number;
  readonly style?: string;
  readonly conversion?: VoiceConversionConfig;
}

export interface VoiceConversionConfig {
  readonly enabled: boolean;
  /** External conversion service base URL, no trailing slash. */
  readonly baseURL: string;
  readonly model: string;
  readonly voice: string;
  readonly format: TtsProviderConfig["format"];
  readonly apiKey: string | undefined;
}

/** Namespaced Gonk persona-scope setting. A future consent-gated editor may
 * write this value; VOX.9 deliberately provides no upload/training/picker UI. */
export const PERSONA_VOICE_KEY = "tts.voice";

export interface PersonaVoiceConfig {
  readonly voice: string;
  readonly speed?: number;
  readonly style?: string;
  readonly conversion?: VoiceConversionConfig;
}

export interface PersonaVoiceScope {
  get(key: string, scope?: "persona"): unknown;
}

export function readPersonaVoice(
  scope: PersonaVoiceScope | undefined,
): PersonaVoiceConfig | undefined {
  const value = scope?.get(PERSONA_VOICE_KEY, "persona");
  if (!isRecord(value) || typeof value.voice !== "string" || !value.voice.trim()) {
    return undefined;
  }
  const speed =
    typeof value.speed === "number" && Number.isFinite(value.speed)
      ? value.speed
      : undefined;
  const style =
    typeof value.style === "string" && value.style.trim()
      ? value.style.trim()
      : undefined;
  const conversion = parsePersonaConversion(value.conversion);
  return {
    voice: value.voice.trim(),
    ...(speed === undefined ? {} : { speed }),
    ...(style === undefined ? {} : { style }),
    ...(conversion === undefined ? {} : { conversion }),
  };
}

export interface VoiceRuntimeEnvironment {
  readonly profile: VoiceProfile;
  readonly tts: TtsProviderConfig;
  readonly stt: VoiceProviderConfig;
}

/** Ports that only ever serve an Apple-Silicon stack. Named so the guard below
 *  can reject them by meaning rather than by magic number. */
const APPLE_ONLY_PORTS = [1243, 10650] as const;

const PROFILE_DEFAULTS: Record<
  VoiceProfile,
  { tts: Omit<TtsProviderConfig, "apiKey">; stt: Omit<VoiceProviderConfig, "apiKey"> }
> = {
  // Kokoro behind an OpenAI-compatible server (kokoro-fastapi's conventional
  // port). Runs on ordinary server hardware. STT defaults to a separate
  // endpoint on purpose: kokoro-fastapi is TTS-only and would 404 on
  // /audio/transcriptions, so the default points at the conventional port for
  // an OpenAI-compatible Whisper server (speaches / faster-whisper-server).
  server: {
    tts: {
      baseURL: "http://localhost:8880/v1",
      model: "kokoro",
      voice: "af_heart",
      format: "mp3",
    },
    stt: { baseURL: "http://localhost:8000/v1", model: "whisper-1" },
  },
  // Gonk's own defaults, valid only where MLX runs.
  "local-mac": {
    tts: {
      baseURL: "http://localhost:1243/v1",
      model: "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit",
      voice: "af_heart",
      format: "mp3",
    },
    stt: { baseURL: "http://localhost:10650/v1", model: "whisper-1" },
  },
};

const TTS_FORMATS = ["mp3", "opus", "aac", "wav", "flac", "pcm"] as const;
const MAX_CONVERTED_AUDIO_BYTES = 32 * 1024 * 1024;

function parseProfile(raw: string | undefined): VoiceProfile {
  const value = raw?.trim();
  if (!value) return "server";
  if (value === "server" || value === "local-mac") return value;
  throw new RuntimeEnvironmentError(
    "INVALID_VOICE_PROFILE",
    "SIGIL_VOICE_PROFILE",
    `must be "server" or "local-mac" (received "${value}")`,
  );
}

function parseFormat(
  raw: string | undefined,
  fallback: TtsProviderConfig["format"],
  variable = "SIGIL_VOICE_TTS_FORMAT",
) {
  const value = raw?.trim();
  if (!value) return fallback;
  const match = TTS_FORMATS.find((format) => format === value);
  if (!match) {
    throw new RuntimeEnvironmentError(
      "INVALID_VOICE_FORMAT",
      variable,
      `must be one of ${TTS_FORMATS.join(", ")} (received "${value}")`,
    );
  }
  return match;
}

function parseEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return false;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new RuntimeEnvironmentError(
    "INVALID_VOICE_CONVERSION",
    "SIGIL_VOICE_CONVERSION_ENABLED",
    'must be "true", "false", "1", or "0"',
  );
}

function parseConversion(
  env: RuntimeEnvironment,
  fallbackFormat: TtsProviderConfig["format"],
): VoiceConversionConfig | undefined {
  if (!parseEnabled(env.SIGIL_VOICE_CONVERSION_ENABLED)) return undefined;
  const baseURL = env.SIGIL_VOICE_CONVERSION_BASE_URL?.trim();
  const model = env.SIGIL_VOICE_CONVERSION_MODEL?.trim();
  const voice = env.SIGIL_VOICE_CONVERSION_VOICE?.trim();
  if (!baseURL || !model || !voice) {
    throw new RuntimeEnvironmentError(
      "INVALID_VOICE_CONVERSION",
      "SIGIL_VOICE_CONVERSION_ENABLED",
      "enabled conversion requires a base URL, model, and voice id",
    );
  }
  return {
    enabled: true,
    baseURL: parseHttpUrl(
      baseURL,
      baseURL,
      "SIGIL_VOICE_CONVERSION_BASE_URL",
    ),
    model,
    voice,
    format: parseFormat(
      env.SIGIL_VOICE_CONVERSION_FORMAT,
      fallbackFormat,
      "SIGIL_VOICE_CONVERSION_FORMAT",
    ),
    apiKey: env.SIGIL_VOICE_CONVERSION_API_KEY?.trim() || undefined,
  };
}

function parsePersonaConversion(value: unknown): VoiceConversionConfig | undefined {
  if (!isRecord(value) || value.enabled === false) return undefined;
  if (
    value.enabled !== true ||
    typeof value.baseURL !== "string" ||
    typeof value.model !== "string" ||
    typeof value.voice !== "string" ||
    typeof value.format !== "string" ||
    !TTS_FORMATS.includes(value.format as TtsProviderConfig["format"])
  ) {
    return undefined;
  }
  try {
    return {
      enabled: true,
      baseURL: parseHttpUrl(value.baseURL, value.baseURL, PERSONA_VOICE_KEY),
      model: value.model.trim(),
      voice: value.voice.trim(),
      format: value.format as TtsProviderConfig["format"],
      apiKey:
        typeof value.apiKey === "string" && value.apiKey.trim()
          ? value.apiKey.trim()
          : undefined,
    };
  } catch {
    return undefined;
  }
}

export interface VoiceConversionRequest {
  readonly bytes: Uint8Array;
  readonly inputFormat: TtsProviderConfig["format"];
  readonly inputMediaType: string;
  readonly config: VoiceConversionConfig;
  readonly signal?: AbortSignal;
}

export interface VoiceConversionResult {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

export interface AppliedVoiceConversionResult extends VoiceConversionResult {
  readonly converted: boolean;
}

export type VoiceConverter = (
  request: VoiceConversionRequest,
) => Promise<VoiceConversionResult>;

export const convertVoiceAudio: VoiceConverter = async (request) => {
  const form = new FormData();
  form.set(
    "audio",
    new Blob([new Uint8Array(request.bytes).buffer], {
      type: request.inputMediaType,
    }),
    `speech.${request.inputFormat}`,
  );
  form.set("model", request.config.model);
  form.set("voice", request.config.voice);
  form.set("response_format", request.config.format);
  const response = await fetch(`${request.config.baseURL}/convert`, {
    method: "POST",
    redirect: "error",
    headers: request.config.apiKey
      ? { Authorization: `Bearer ${request.config.apiKey}` }
      : {},
    body: form,
    ...(request.signal ? { signal: request.signal } : {}),
  });
  if (!response.ok) throw new Error("Voice conversion was rejected");
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_CONVERTED_AUDIO_BYTES
  ) {
    throw new Error("Voice conversion returned oversized audio");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CONVERTED_AUDIO_BYTES) {
    throw new Error("Voice conversion returned invalid audio");
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return {
    bytes,
    mediaType: contentType?.startsWith("audio/")
      ? contentType
      : voiceMediaType(request.config.format),
  };
};

export async function applyVoiceConversion(
  input: Omit<VoiceConversionRequest, "config"> & {
    readonly conversion?: VoiceConversionConfig;
  },
  converter?: VoiceConverter,
): Promise<AppliedVoiceConversionResult> {
  if (!input.conversion?.enabled) {
    return {
      bytes: input.bytes,
      mediaType: input.inputMediaType,
      converted: false,
    };
  }
  try {
    const result = await (converter ?? convertVoiceAudio)({
      ...input,
      config: input.conversion,
    });
    return { ...result, converted: true };
  } catch {
    return {
      bytes: input.bytes,
      mediaType: input.inputMediaType,
      converted: false,
    };
  }
}

export function resolveTtsConfig(
  deployment: TtsProviderConfig,
  persona: PersonaVoiceConfig | undefined,
): TtsProviderConfig {
  return {
    ...deployment,
    ...(persona
      ? {
          voice: persona.voice,
          ...(persona.speed === undefined ? {} : { speed: persona.speed }),
          ...(persona.style === undefined ? {} : { style: persona.style }),
          ...(persona.conversion === undefined
            ? {}
            : { conversion: persona.conversion }),
        }
      : {}),
  };
}

function voiceMediaType(format: TtsProviderConfig["format"]): string {
  return {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    wav: "audio/wav",
    flac: "audio/flac",
    pcm: "audio/pcm",
  }[format];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * An MLX model or an Apple-only port reaching a server deployment means the
 * Mac defaults leaked, and voice would fail at runtime with a confusing
 * connection error instead of a clear configuration one. Fail at startup.
 */
function assertPortableOnServer(env: VoiceRuntimeEnvironment): void {
  if (env.profile !== "server") return;
  for (const [label, provider] of [
    ["tts", env.tts],
    ["stt", env.stt],
  ] as const) {
    // Matches "mlx" as a whole word anywhere in the id, so non-canonical
    // names are caught too — `someorg/mlx-tts-model` and `qwen-mlx-variant`
    // are just as unrunnable on Linux as `mlx-community/...`, and a prefix
    // match would have waved both through.
    if (/\bmlx\b/i.test(provider.model)) {
      throw new RuntimeEnvironmentError(
        "UNPORTABLE_VOICE_PROVIDER",
        `SIGIL_VOICE_${label.toUpperCase()}_MODEL`,
        `"${provider.model}" requires Apple Silicon, but SIGIL_VOICE_PROFILE is "server"`,
      );
    }
    const port = Number(new URL(provider.baseURL).port);
    if (APPLE_ONLY_PORTS.includes(port as (typeof APPLE_ONLY_PORTS)[number])) {
      throw new RuntimeEnvironmentError(
        "UNPORTABLE_VOICE_PROVIDER",
        `SIGIL_VOICE_${label.toUpperCase()}_BASE_URL`,
        `port ${port} serves an Apple-Silicon-only voice stack, but SIGIL_VOICE_PROFILE is "server"`,
      );
    }
  }
}

export function readVoiceEnvironment(
  env: RuntimeEnvironment,
): VoiceRuntimeEnvironment {
  const profile = parseProfile(env.SIGIL_VOICE_PROFILE);
  const defaults = PROFILE_DEFAULTS[profile];

  const ttsBaseURL = env.SIGIL_VOICE_TTS_BASE_URL?.trim() || defaults.tts.baseURL;
  const sttBaseURL = env.SIGIL_VOICE_STT_BASE_URL?.trim() || defaults.stt.baseURL;
  const conversion = parseConversion(env, defaults.tts.format);

  const resolved: VoiceRuntimeEnvironment = {
    profile,
    tts: {
      baseURL: parseHttpUrl(ttsBaseURL, ttsBaseURL, "SIGIL_VOICE_TTS_BASE_URL"),
      model: env.SIGIL_VOICE_TTS_MODEL?.trim() || defaults.tts.model,
      voice: env.SIGIL_VOICE_TTS_VOICE?.trim() || defaults.tts.voice,
      format: parseFormat(env.SIGIL_VOICE_TTS_FORMAT, defaults.tts.format),
      apiKey: env.SIGIL_VOICE_TTS_API_KEY?.trim() || undefined,
      ...(conversion ? { conversion } : {}),
    },
    stt: {
      baseURL: parseHttpUrl(sttBaseURL, sttBaseURL, "SIGIL_VOICE_STT_BASE_URL"),
      model: env.SIGIL_VOICE_STT_MODEL?.trim() || defaults.stt.model,
      apiKey: env.SIGIL_VOICE_STT_API_KEY?.trim() || undefined,
    },
  };

  assertPortableOnServer(resolved);
  return resolved;
}
