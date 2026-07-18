import { shape, type ToolContext, type ToolRegistry } from "@gonk/tool-registry";

import {
  getSessionArtifactStore,
  type SessionArtifactMetadata,
  type SessionArtifactStore,
} from "../artifact-store.js";
import {
  emptyObjectSchema,
  objectSchema,
  readHints,
} from "./schemas.js";
import { isEmptyObject, isRecord } from "./validators.js";

const MAX_TEXT_CHARS = 200_000;

export interface ReadFileInput {
  id: string;
}

export function registerFileTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
): void {
  registry.register({
    name: "sigil-list-session-files",
    description:
      "List the files attached to the current agent session. Use this to find durable documents before reading one by id.",
    visibility: "always",
    approval: "read",
    input: shape<Record<string, never>>(
      isEmptyObject,
      "Expected an empty object.",
    ),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async (_input, ctx) => ({
      data: { files: await artifacts.listBySession(requireSessionScope(ctx)) },
    }),
  });

  registry.register({
    name: "sigil-read-file",
    description:
      "Read the content of a file attached to the current agent session by id. Text files are decoded as UTF-8 with a bounded response; binary files return metadata instead of bytes.",
    visibility: "always",
    approval: "read",
    input: shape<ReadFileInput>(
      isReadFileInput,
      "Expected an object with a non-empty string `id`.",
    ),
    inputJsonSchema: objectSchema(
      { id: { type: "string", minLength: 1 } },
      ["id"],
    ),
    hints: readHints,
    handler: async (input, ctx) => {
      const scope = requireSessionScope(ctx);
      const artifact = (await artifacts.listBySession(scope)).find(
        (candidate) => candidate.id === input.id,
      );
      if (!artifact) {
        throw new Error(`Unknown file id for the current session: ${input.id}`);
      }

      const content = await artifacts.readContent(artifact.id);
      if (!isTextualFile(artifact)) {
        return {
          data: {
            id: artifact.id,
            filename: artifact.filename,
            mediaType: content.mediaType,
            size: artifact.size,
            content: `[Binary file ${artifact.filename}; content is not decoded by this tool.]`,
          },
        };
      }

      const text = new TextDecoder("utf-8", { fatal: false }).decode(
        content.bytes,
      );
      const truncated = text.length > MAX_TEXT_CHARS;
      const body = truncated
        ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n[...truncated at ${MAX_TEXT_CHARS} characters]`
        : text;
      return {
        data: {
          id: artifact.id,
          filename: artifact.filename,
          mediaType: content.mediaType,
          size: artifact.size,
          content: body,
          ...(truncated ? { truncated: true } : {}),
        },
      };
    },
  });
}

function isReadFileInput(value: unknown): value is ReadFileInput {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "id") &&
    typeof value.id === "string" &&
    value.id.trim().length > 0
  );
}

function requireSessionScope(ctx: ToolContext): string {
  if (!isRecord(ctx.host) || typeof ctx.host.sessionScope !== "string") {
    throw new Error("File tools require the caller's session scope.");
  }
  const scope = ctx.host.sessionScope.trim();
  if (!scope) throw new Error("File tools require the caller's session scope.");
  return scope;
}

function isTextualFile(artifact: SessionArtifactMetadata): boolean {
  const mediaType = artifact.mediaType.split(";", 1)[0]?.trim().toLowerCase();
  if (
    mediaType.startsWith("text/") ||
    mediaType.endsWith("+json") ||
    mediaType.endsWith("+xml")
  ) {
    return true;
  }
  if (
    new Set([
      "application/json",
      "application/xml",
      "application/yaml",
      "application/x-yaml",
      "application/toml",
      "application/x-ndjson",
      "application/csv",
      "application/markdown",
      "application/javascript",
      "application/typescript",
    ]).has(mediaType)
  ) {
    return true;
  }
  const extension = /\.([a-z0-9]+)$/i.exec(artifact.filename)?.[1]?.toLowerCase();
  return (
    extension !== undefined &&
    new Set([
      "c",
      "cc",
      "cpp",
      "css",
      "csv",
      "go",
      "h",
      "htm",
      "html",
      "ini",
      "java",
      "js",
      "jsx",
      "json",
      "log",
      "md",
      "markdown",
      "ndjson",
      "py",
      "rb",
      "rs",
      "sh",
      "sql",
      "ts",
      "tsx",
      "toml",
      "tsv",
      "txt",
      "xml",
      "yaml",
      "yml",
    ]).has(extension)
  );
}
