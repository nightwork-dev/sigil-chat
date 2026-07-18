import { shape, type ToolContext, type ToolRegistry } from "@gonk/tool-registry";

import {
  getSessionArtifactStore,
  type SessionArtifactMetadata,
  type SessionArtifactStore,
} from "../artifact-store.js";
import {
  normalizeScope,
  RESOURCE_SCOPE_TIERS,
  type ResourceScope,
  type ScopeInput,
} from "../artifact-scope.js";
import { objectSchema, readHints } from "./schemas.js";
import { isEmptyObject, isRecord } from "./validators.js";

const MAX_TEXT_CHARS = 200_000;

export interface ResourceScopeInput {
  scope?: ResourceScope;
}

export interface ReadFileInput extends ResourceScopeInput {
  id: string;
}

export function registerFileTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
): void {
  registry.register({
    name: "sigil-list-session-files",
    description:
      "List files attached to the request's session, project, or persona resource scope. Omit scope to use the request's session scope.",
    visibility: "always",
    approval: "read",
    input: shape<ResourceScopeInput>(
      isListFilesInput,
      "Expected an object with an optional `{ tier, id }` resource scope.",
    ),
    inputJsonSchema: objectSchema({ scope: resourceScopeSchema() }),
    hints: readHints,
    handler: async (input, ctx) => {
      const scope = requireResourceScope(input.scope, ctx);
      return {
        data: {
          files: await artifacts.listByScope(scope, ctx.auth?.principal),
        },
      };
    },
  });

  registry.register({
    name: "sigil-read-file",
    description:
      "Read a file attached to the request's session, project, or persona resource scope by id. Omit scope to use the request's session scope; text is decoded with a bounded response and binary files return metadata.",
    visibility: "always",
    approval: "read",
    input: shape<ReadFileInput>(
      isReadFileInput,
      "Expected an object with a non-empty string `id` and an optional `{ tier, id }` resource scope.",
    ),
    inputJsonSchema: objectSchema(
      { id: { type: "string", minLength: 1 }, scope: resourceScopeSchema() },
      ["id"],
    ),
    hints: readHints,
    handler: async (input, ctx) => {
      const scope = requireResourceScope(input.scope, ctx);
      const principal = ctx.auth?.principal;
      const artifact = (await artifacts.listByScope(scope, principal)).find(
        (candidate) => candidate.id === input.id,
      );
      if (!artifact) {
        throw new Error(`Unknown file id for requested scope: ${input.id}`);
      }

      const content = await artifacts.readContent(input.id, scope, principal);
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

function isListFilesInput(value: unknown): value is ResourceScopeInput {
  return isRecord(value) && isScopeInput(value);
}

function isReadFileInput(value: unknown): value is ReadFileInput {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "id" || key === "scope") &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    isScopeInput(value)
  );
}

function isScopeInput(value: Record<string, unknown>): boolean {
  return value.scope === undefined || isResourceScope(value.scope);
}

function isResourceScope(value: unknown): value is ResourceScope {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "tier" || key === "id") &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.tier === "string" &&
    (RESOURCE_SCOPE_TIERS as readonly string[]).includes(value.tier) &&
    normalizeScope(value as ScopeInput) !== undefined
  );
}

function requireResourceScope(
  requested: ResourceScope | undefined,
  ctx: ToolContext,
): ResourceScope {
  const hostScope = requestScope(ctx);
  const scope = normalizeScope(requested ?? hostScope);
  if (!scope) {
    throw new Error(
      "File tools require a resource scope, either in the request or in the tool input.",
    );
  }
  return scope;
}

function requestScope(ctx: ToolContext): ResourceScope | undefined {
  if (!isRecord(ctx.host)) return undefined;
  return (
    normalizeScope(ctx.host.resourceScope as ScopeInput | undefined) ??
    normalizeScope(ctx.host.sessionScope as string | undefined)
  );
}

function resourceScopeSchema(): Record<string, unknown> {
  return objectSchema(
    {
      tier: { type: "string", enum: RESOURCE_SCOPE_TIERS },
      id: { type: "string", minLength: 1 },
    },
    ["tier", "id"],
  );
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
