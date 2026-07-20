import { shape, type ToolRegistry } from "@gonk/tool-registry";
import {
  artifactPublicUrl,
  getSessionArtifactStore,
  type SessionArtifactStore,
} from "../artifact-store.js";
import { generateCodexImage } from "./image-provider.js";
import {
  editImageThroughGateway,
  type ImageEditProvider,
} from "./gateway-image-edit.js";
import { requireResourceScope } from "./files.js";
import { writeHints } from "./schemas.js";
import { hasOnlyKeys, isRecord } from "./validators.js";

export interface GenerateImageInput {
  prompt: string;
  width?: number;
  height?: number;
}

export type ImageGenerationProvider = typeof generateCodexImage;

const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;

export interface EditImageInput {
  instruction: string;
  sourceArtifactId?: string;
  inlineImage?: {
    base64: string;
    mediaType: (typeof IMAGE_MEDIA_TYPES)[number];
    filename?: string;
  };
  width?: number;
  height?: number;
}

function isGenerateImageInput(value: unknown): value is GenerateImageInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.prompt !== "string" || v.prompt.trim().length === 0)
    return false;
  if (v.width !== undefined && typeof v.width !== "number") return false;
  if (v.height !== undefined && typeof v.height !== "number") return false;
  return true;
}

export function registerImageTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
  editImage: ImageEditProvider = editImageThroughGateway,
  generateImage: ImageGenerationProvider | null = generateCodexImage,
): void {
  if (generateImage)
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
      handler: async (input, ctx) => {
        const width = input.width ?? 1024;
        const height = input.height ?? 1024;
        const image = await generateImage({
          prompt: input.prompt,
          size: `${width}x${height}`,
        });

        const scope = requireResourceScope(undefined, ctx);
        const stored = await artifacts.putFile(
          {
            bytes: image.bytes,
            filename: "generated-image",
            mediaType: image.mimeType,
            scope,
          },
          ctx.auth?.principal,
        );

        return {
          data: {
            url: artifactPublicUrl(stored.id, stored.scope),
            prompt: image.revisedPrompt ?? input.prompt,
            mediaType: image.mimeType,
          },
        };
      },
    });

  registry.register({
    name: "sigil-edit-image",
    description:
      "Edit an existing session image from a source artifact or inline image using a real instruction-edit backend. Returns a new session artifact and same-origin /img URL with derivation provenance. Fails loudly if the edit backend is unavailable; it never substitutes text-to-image generation.",
    visibility: "always",
    approval: "write",
    input: shape<EditImageInput>(
      isEditImageInput,
      "Expected a non-empty `instruction`, exactly one of `sourceArtifactId` or `inlineImage`, and optional numeric `width`/`height`.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        instruction: { type: "string", minLength: 1 },
        sourceArtifactId: { type: "string", minLength: 1 },
        inlineImage: {
          type: "object",
          properties: {
            base64: { type: "string", minLength: 1 },
            mediaType: { type: "string", enum: IMAGE_MEDIA_TYPES },
            filename: { type: "string", minLength: 1 },
          },
          required: ["base64", "mediaType"],
          additionalProperties: false,
        },
        width: { type: "integer", minimum: 64, maximum: 2048 },
        height: { type: "integer", minimum: 64, maximum: 2048 },
      },
      required: ["instruction"],
      oneOf: [
        { required: ["sourceArtifactId"], not: { required: ["inlineImage"] } },
        { required: ["inlineImage"], not: { required: ["sourceArtifactId"] } },
      ],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input, ctx) => {
      const scope = requireResourceScope(undefined, ctx);
      const principal = ctx.auth?.principal;
      let sourceArtifactId = input.sourceArtifactId;
      let sourceBytes: Uint8Array;
      let sourceMediaType: string;
      let sourceFilename: string;

      if (sourceArtifactId) {
        const source = (await artifacts.listByScope(scope, principal)).find(
          (candidate) => candidate.id === sourceArtifactId,
        );
        if (!source) {
          throw new Error(
            `Unknown source image artifact for requested scope: ${sourceArtifactId}`,
          );
        }
        assertImageMediaType(source.mediaType);
        const content = await artifacts.readContent(
          sourceArtifactId,
          scope,
          principal,
        );
        sourceBytes = content.bytes;
        sourceMediaType = content.mediaType;
        sourceFilename = source.filename;
      } else {
        const inline = input.inlineImage as NonNullable<
          EditImageInput["inlineImage"]
        >;
        sourceBytes = decodeInlineImage(inline.base64);
        sourceMediaType = inline.mediaType;
        sourceFilename = inline.filename ?? "inline-source-image";
        const source = await artifacts.putFile(
          {
            bytes: sourceBytes,
            filename: sourceFilename,
            mediaType: sourceMediaType,
            scope,
          },
          principal,
        );
        sourceArtifactId = source.id;
      }

      const edited = await editImage({
        sourceBytes,
        sourceMediaType,
        instruction: input.instruction.trim(),
        width: input.width ?? 1024,
        height: input.height ?? 1024,
        signal: ctx.signal,
        env: ctx.env,
      });
      if (edited.bytes.byteLength === 0) {
        throw new Error(
          "Image edit backend returned an empty derived image. No text-to-image fallback was attempted.",
        );
      }
      assertImageMediaType(edited.mediaType);

      const stored = await artifacts.putFile(
        {
          bytes: edited.bytes,
          filename: editedFilename(sourceFilename, edited.mediaType),
          mediaType: edited.mediaType,
          scope,
          provenance: {
            kind: "image-edit",
            sourceArtifactId: sourceArtifactId as string,
            instruction: input.instruction.trim(),
            backend: edited.backend,
          },
        },
        principal,
      );

      return {
        data: {
          artifactId: stored.id,
          url: artifactPublicUrl(stored.id, stored.scope),
          mediaType: stored.mediaType,
          backend: edited.backend,
          sourceArtifactId,
          instruction: input.instruction.trim(),
          prompt: edited.revisedPrompt ?? input.instruction.trim(),
        },
      };
    },
  });
}

function isEditImageInput(value: unknown): value is EditImageInput {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      "instruction",
      "sourceArtifactId",
      "inlineImage",
      "width",
      "height",
    ]) ||
    typeof value.instruction !== "string" ||
    value.instruction.trim().length === 0
  ) {
    return false;
  }
  const hasArtifact =
    typeof value.sourceArtifactId === "string" &&
    value.sourceArtifactId.trim().length > 0;
  const hasInline = isInlineImage(value.inlineImage);
  if (hasArtifact === hasInline) return false;
  return validDimension(value.width) && validDimension(value.height);
}

function isInlineImage(
  value: unknown,
): value is NonNullable<EditImageInput["inlineImage"]> {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["base64", "mediaType", "filename"]) &&
    typeof value.base64 === "string" &&
    value.base64.length > 0 &&
    typeof value.mediaType === "string" &&
    (IMAGE_MEDIA_TYPES as readonly string[]).includes(value.mediaType) &&
    (value.filename === undefined ||
      (typeof value.filename === "string" && value.filename.length > 0))
  );
}

function validDimension(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 64 &&
      value <= 2048)
  );
}

function decodeInlineImage(encoded: string): Uint8Array {
  const base64 = encoded.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("inlineImage.base64 is not valid base64 image data.");
  }
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.byteLength === 0) {
    throw new Error("inlineImage.base64 decoded to an empty image.");
  }
  if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
    throw new Error("inlineImage exceeds the 10 MiB edit-source limit.");
  }
  return bytes;
}

function assertImageMediaType(mediaType: string): void {
  if (!(IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    throw new Error(
      `Image editing requires PNG, JPEG, or WebP source/output bytes; received ${mediaType}.`,
    );
  }
}

function editedFilename(sourceFilename: string, mediaType: string): string {
  const stem = sourceFilename.replace(/\.[^.]+$/, "").slice(0, 80) || "image";
  const extension =
    mediaType === "image/jpeg"
      ? "jpg"
      : mediaType === "image/webp"
        ? "webp"
        : "png";
  return `${stem}-edited.${extension}`;
}
