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

function parseFormat(raw: string | undefined, fallback: TtsProviderConfig["format"]) {
  const value = raw?.trim();
  if (!value) return fallback;
  const match = TTS_FORMATS.find((format) => format === value);
  if (!match) {
    throw new RuntimeEnvironmentError(
      "INVALID_VOICE_FORMAT",
      "SIGIL_VOICE_TTS_FORMAT",
      `must be one of ${TTS_FORMATS.join(", ")} (received "${value}")`,
    );
  }
  return match;
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

  const resolved: VoiceRuntimeEnvironment = {
    profile,
    tts: {
      baseURL: parseHttpUrl(ttsBaseURL, ttsBaseURL, "SIGIL_VOICE_TTS_BASE_URL"),
      model: env.SIGIL_VOICE_TTS_MODEL?.trim() || defaults.tts.model,
      voice: env.SIGIL_VOICE_TTS_VOICE?.trim() || defaults.tts.voice,
      format: parseFormat(env.SIGIL_VOICE_TTS_FORMAT, defaults.tts.format),
      apiKey: env.SIGIL_VOICE_TTS_API_KEY?.trim() || undefined,
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
