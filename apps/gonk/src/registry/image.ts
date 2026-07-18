import { shape, type ToolRegistry } from "@gonk/tool-registry";
import { ObjectAlreadyExistsError } from "@mirk/artifact";

import {
  getArtifactStore,
  imageKeyFor,
  imagePublicUrl,
} from "../artifact-store.js";
import { generateCodexImage } from "./codex-image.js";
import { writeHints } from "./schemas.js";

export interface GenerateImageInput {
  prompt: string;
  width?: number;
  height?: number;
}

function isGenerateImageInput(value: unknown): value is GenerateImageInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.prompt !== "string" || v.prompt.trim().length === 0) return false;
  if (v.width !== undefined && typeof v.width !== "number") return false;
  if (v.height !== undefined && typeof v.height !== "number") return false;
  return true;
}

export function registerImageTools(registry: ToolRegistry): void {
  registry.register({
    name: "sigil-generate-image",
    description:
      "Generate an image from a text prompt using the local Codex login (the same ChatGPT session the agent runs on — no separate API key). Returns the image inline in the chat. Use when the user asks to see an illustration, mockup, diagram sketch, or concept art.",
    visibility: "always",
    approval: "write",
    input: shape<GenerateImageInput>(
      isGenerateImageInput,
      "Expected an object with a non-empty string `prompt` (optional numeric `width`/`height`).",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1 },
        width: { type: "integer", minimum: 64, maximum: 2048 },
        height: { type: "integer", minimum: 64, maximum: 2048 },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => {
      const width = input.width ?? 1024;
      const height = input.height ?? 1024;
      const image = await generateCodexImage({
        prompt: input.prompt,
        size: `${width}x${height}`,
      });

      // Persist the bytes in the artifact store and hand back a served URL —
      // NOT a base64 data URL (which would bloat every message in the
      // transcript). The key is a content hash, so identical images dedupe.
      const key = imageKeyFor(image.bytes, image.mimeType);
      try {
        await getArtifactStore().put(key, image.bytes, {
          mediaType: image.mimeType,
          ifAbsent: true,
        });
      } catch (error) {
        // Identical bytes already stored — reuse the existing object.
        if (!(error instanceof ObjectAlreadyExistsError)) throw error;
      }

      return {
        data: {
          url: imagePublicUrl(key),
          prompt: image.revisedPrompt ?? input.prompt,
          mediaType: image.mimeType,
        },
      };
    },
  });
}
