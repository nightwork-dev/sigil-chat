import { describe, expect, it } from "vitest";

import { readVoiceEnvironment, type VoiceProfile } from "./voice.js";

/** The single source of truth for what each profile is FOR. Expectations below
 *  derive from this rather than repeating literals, so adding a profile or
 *  moving a default updates the tests with it. */
const PROFILE_INTENT: Record<
  VoiceProfile,
  { readonly appleSiliconOnly: boolean }
> = {
  server: { appleSiliconOnly: false },
  "local-mac": { appleSiliconOnly: true },
};

const isAppleOnlyModel = (model: string) => /mlx/i.test(model);
const APPLE_ONLY_PORTS = ["1243", "10650"];
const portOf = (url: string) => new URL(url).port;

describe("voice profiles", () => {
  it("defaults to the portable server profile when unset", () => {
    const env = readVoiceEnvironment({});
    expect(env.profile).toBe("server");
  });

  it("gives every profile a usable tts and stt provider", () => {
    for (const profile of Object.keys(PROFILE_INTENT) as VoiceProfile[]) {
      const env = readVoiceEnvironment({ SIGIL_VOICE_PROFILE: profile });
      for (const provider of [env.tts, env.stt]) {
        expect(provider.baseURL).toMatch(/^https?:\/\//);
        expect(provider.model.length).toBeGreaterThan(0);
      }
      expect(env.tts.voice.length).toBeGreaterThan(0);
    }
  });

  // The whole point of the profile split: a Linux deployment must never
  // inherit an Apple-Silicon stack it cannot run.
  it("keeps Apple-Silicon providers out of the server profile", () => {
    const env = readVoiceEnvironment({ SIGIL_VOICE_PROFILE: "server" });
    for (const provider of [env.tts, env.stt]) {
      expect(isAppleOnlyModel(provider.model)).toBe(false);
      expect(APPLE_ONLY_PORTS).not.toContain(portOf(provider.baseURL));
    }
  });

  it("still allows the MLX stack on local-mac, so both profiles coexist", () => {
    const env = readVoiceEnvironment({ SIGIL_VOICE_PROFILE: "local-mac" });
    expect(PROFILE_INTENT["local-mac"].appleSiliconOnly).toBe(true);
    expect(isAppleOnlyModel(env.tts.model)).toBe(true);
  });

  it("rejects an unknown profile instead of silently falling back", () => {
    expect(() => readVoiceEnvironment({ SIGIL_VOICE_PROFILE: "gpu-box" })).toThrow(
      /server.*local-mac/s,
    );
  });
});

describe("explicit overrides", () => {
  // Switching between a local Kokoro server and a remote OpenAI-compatible
  // endpoint must be configuration, never a code change.
  it("follows an overridden base URL to a remote endpoint", () => {
    const env = readVoiceEnvironment({
      SIGIL_VOICE_TTS_BASE_URL: "https://voice.example.com/v1",
      SIGIL_VOICE_STT_BASE_URL: "https://voice.example.com/v1",
      SIGIL_VOICE_TTS_API_KEY: "sk-test",
    });
    expect(env.tts.baseURL).toBe("https://voice.example.com/v1");
    expect(env.stt.baseURL).toBe("https://voice.example.com/v1");
    expect(env.tts.apiKey).toBe("sk-test");
    expect(env.stt.apiKey).toBeUndefined();
  });

  it("overrides model, voice and format independently", () => {
    const env = readVoiceEnvironment({
      SIGIL_VOICE_TTS_MODEL: "kokoro-v1",
      SIGIL_VOICE_TTS_VOICE: "bf_emma",
      SIGIL_VOICE_TTS_FORMAT: "wav",
      SIGIL_VOICE_STT_MODEL: "whisper-large-v3",
    });
    expect(env.tts.model).toBe("kokoro-v1");
    expect(env.tts.voice).toBe("bf_emma");
    expect(env.tts.format).toBe("wav");
    expect(env.stt.model).toBe("whisper-large-v3");
  });

  it("rejects an unsupported audio format", () => {
    expect(() =>
      readVoiceEnvironment({ SIGIL_VOICE_TTS_FORMAT: "ogg" }),
    ).toThrow(/mp3/);
  });
});

describe("server portability guard", () => {
  // Well-formed but unrunnable: the failure must be a clear configuration
  // error at startup, not a confusing connection error at first use.
  it("rejects an MLX model on the server profile", () => {
    expect(() =>
      readVoiceEnvironment({
        SIGIL_VOICE_PROFILE: "server",
        SIGIL_VOICE_TTS_MODEL: "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit",
      }),
    ).toThrow(/Apple Silicon/);
  });

  it("rejects an Apple-only port on the server profile", () => {
    for (const port of APPLE_ONLY_PORTS) {
      expect(() =>
        readVoiceEnvironment({
          SIGIL_VOICE_PROFILE: "server",
          SIGIL_VOICE_STT_BASE_URL: `http://localhost:${port}/v1`,
        }),
      ).toThrow(new RegExp(`${port}`));
    }
  });

  it("permits those same values on local-mac", () => {
    expect(() =>
      readVoiceEnvironment({
        SIGIL_VOICE_PROFILE: "local-mac",
        SIGIL_VOICE_TTS_MODEL: "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit",
        SIGIL_VOICE_STT_BASE_URL: "http://localhost:10650/v1",
      }),
    ).not.toThrow();
  });
});
