// `sigil-synthesize-speech` — synthesis as a first-class tool call.
//
// This is deliberately not "read the last reply aloud". The agent chooses the
// words, the voice, and the delivery, and the result is a durable audio
// artifact in the session's resource scope that the transcript and the
// artifacts workspace both play. Routing synthesis through the registry rather
// than a direct fetch is the point: scope authorization, approval, and Gonk
// receipts apply to it like any other write tool.

import { shape, ToolError, type ToolRegistry } from "@gonk/tool-registry";
import {
  artifactPublicUrl,
  getSessionArtifactStore,
  type SessionArtifactStore,
} from "@workspace/artifact-store/repository";
import { formatScopeHeader } from "@workspace/artifact-store/scope";

import { writeHints } from "./domain-schemas.js";
import { requireResourceScope } from "./files.js";
import {
  SPEECH_FORMATS,
  synthesizeThroughVoiceProvider,
  type SpeechFormat,
  type SpeechSynthesisProvider,
} from "./speech-provider.js";
import { hasOnlyKeys, isRecord } from "./validators.js";

/** One utterance, matching the read-aloud route's MAX_SPEAKABLE_LENGTH in
 *  apps/web/src/lib/agent-voice.server.ts. Synthesis is a projection of a
 *  passage, not a document; past this the caller should split the text, and an
 *  unbounded body would hold the synth backend for minutes. */
export const MAX_SYNTHESIZABLE_LENGTH = 4000;

/** Providers name voices freely (`af_heart`, `alloy`, an MLX speaker id), so
 *  the constraint is shape and length rather than an enum the deployment would
 *  immediately outgrow. */
const MAX_VOICE_LENGTH = 64;

const MIN_SPEED = 0.25;
const MAX_SPEED = 4;

export interface SynthesizeSpeechInput {
  text: string;
  voice?: string;
  format?: SpeechFormat;
  speed?: number;
}

export function registerSpeechTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
  synthesize: SpeechSynthesisProvider = synthesizeThroughVoiceProvider,
): void {
  registry.register({
    name: "sigil-synthesize-speech",
    description:
      "Speak a passage of text aloud as audio, in a chosen voice and delivery, and attach it to the conversation as a playable artifact. Use when the user asks to hear something spoken, wants a line performed a particular way, or wants a named voice — not for narrating your own replies, which the chat surface already handles. Voices and formats are whatever the deployment's speech provider supports; omit them for its defaults.",
    visibility: "always",
    approval: "write",
    input: shape<SynthesizeSpeechInput>(
      isSynthesizeSpeechInput,
      `Expected an object with non-empty string \`text\` of at most ${MAX_SYNTHESIZABLE_LENGTH} characters, plus optional \`voice\`, \`format\` (${SPEECH_FORMATS.join(", ")}), and \`speed\` (${MIN_SPEED}–${MAX_SPEED}).`,
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1, maxLength: MAX_SYNTHESIZABLE_LENGTH },
        voice: { type: "string", minLength: 1, maxLength: MAX_VOICE_LENGTH },
        format: { type: "string", enum: [...SPEECH_FORMATS] },
        speed: { type: "number", minimum: MIN_SPEED, maximum: MAX_SPEED },
      },
      required: ["text"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input, ctx) => {
      const text = input.text.trim();
      if (text.length > MAX_SYNTHESIZABLE_LENGTH) {
        throw new ToolError(
          "INVALID_INPUT",
          `Text to synthesize exceeds the ${MAX_SYNTHESIZABLE_LENGTH}-character limit for one utterance.`,
        );
      }

      const scope = requireResourceScope(undefined, ctx);
      const spoken = await synthesize({
        text,
        ...(input.voice ? { voice: input.voice } : {}),
        ...(input.format ? { format: input.format } : {}),
        ...(input.speed === undefined ? {} : { speed: input.speed }),
        signal: ctx.signal,
        env: ctx.env,
      });

      const stored = await artifacts.putFile(
        {
          bytes: spoken.bytes,
          filename: `speech-${spoken.voice}.${spoken.format}`,
          mediaType: spoken.mediaType,
          scope,
        },
        ctx.auth?.principal,
      );

      return {
        data: {
          artifactId: stored.id,
          url: artifactPublicUrl(stored.id, stored.scope),
          scope: formatScopeHeader(stored.scope),
          mediaType: stored.mediaType,
          filename: stored.filename,
          voice: spoken.voice,
          format: spoken.format,
          speed: input.speed ?? 1,
          text,
        },
      };
    },
  });
}

function isSynthesizeSpeechInput(
  value: unknown,
): value is SynthesizeSpeechInput {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ["text", "voice", "format", "speed"])) return false;
  if (typeof value.text !== "string") return false;
  const text = value.text.trim();
  if (text.length === 0 || text.length > MAX_SYNTHESIZABLE_LENGTH) return false;
  if (value.voice !== undefined && !isValidVoice(value.voice)) return false;
  if (
    value.format !== undefined &&
    !(SPEECH_FORMATS as readonly unknown[]).includes(value.format)
  ) {
    return false;
  }
  return isValidSpeed(value.speed);
}

function isValidVoice(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_VOICE_LENGTH &&
    // Voice ids reach an upstream JSON body; control characters and slashes
    // have no place in one and would only ever be smuggling.
    /^[A-Za-z0-9._-]+$/.test(value)
  );
}

function isValidSpeed(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= MIN_SPEED &&
      value <= MAX_SPEED)
  );
}
