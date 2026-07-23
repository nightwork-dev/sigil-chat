import {
  shape,
  type ToolContext,
  type ToolRegistry,
} from "@gonk/tool-registry";

import {
  ArtifactScopeAccessDeniedError,
  getSessionArtifactStore,
  type SessionArtifactMetadata,
  type SessionArtifactStore,
} from "@workspace/artifact-store/repository";
import {
  normalizeScope,
  RESOURCE_SCOPE_TIERS,
  type ResourceScope,
  type ScopeInput,
} from "@workspace/artifact-store/scope";
import { objectSchema, readHints } from "./domain-schemas.js";
import { isRecord } from "./validators.js";

const MAX_TEXT_CHARS = 200_000;

interface ResourceUniverseProject {
  readonly id: string;
  readonly name: string;
}

interface ResourceUniverseWorkspace {
  readonly id: string;
  readonly name: string;
}

interface ResourceUniverseSession {
  readonly id: string;
  readonly title: string;
}

export interface ResourceUniverseRegistries {
  readonly projects: { list(): readonly ResourceUniverseProject[] };
  readonly workspaces: { list(): readonly ResourceUniverseWorkspace[] };
  readonly sessions?: {
    listOwned(principalId: string): readonly ResourceUniverseSession[];
  };
}

interface DiscoverResourcesInput extends Record<string, never> {}

export interface ResourceScopeInput {
  scope?: ResourceScope;
}

export interface ReadFileInput extends ResourceScopeInput {
  id: string;
}

export function registerFileTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
  universe?: ResourceUniverseRegistries,
): void {
  if (universe) {
    registry.register({
      name: "sigil-resource-discover",
      description:
        "For a personal agent session, discover the current principal's readable project, workspace, and session resource scopes plus identity-deduplicated file metadata. Every scope is re-authorized live; use sigil-read-file with one returned scope to retrieve content.",
      visibility: "always",
      approval: "read",
      input: shape<DiscoverResourcesInput>(
        (value): value is DiscoverResourcesInput =>
          isRecord(value) && Object.keys(value).length === 0,
        "Expected an empty object.",
      ),
      inputJsonSchema: objectSchema({}),
      hints: readHints,
      handler: async (_input, ctx) => {
        const principal = requirePrincipalReach(ctx);
        return {
          data: await discoverPrincipalResourceUniverse({
            artifacts,
            principal,
            universe,
          }),
        };
      },
    });
  }

  registry.register({
    name: "sigil-list-session-files",
    description:
      "List files attached to the request's session, workspace, project, or persona resource scope. Omit scope to use the request's session scope.",
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
      "Read a file attached to the request's session, workspace, project, or persona resource scope by id. Omit scope to use the request's session scope; text is decoded with a bounded response and binary files return metadata.",
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

export async function discoverPrincipalResourceUniverse(input: {
  artifacts: SessionArtifactStore;
  principal: NonNullable<ToolContext["auth"]>["principal"];
  universe: ResourceUniverseRegistries;
}) {
  const candidates = [
    ...input.universe.projects.list().map((project) => ({
      scope: { tier: "project" as const, id: project.id },
      label: project.name,
    })),
    ...input.universe.workspaces.list().map((workspace) => ({
      scope: { tier: "workspace" as const, id: workspace.id },
      label: workspace.name,
    })),
    ...(input.universe.sessions?.listOwned(input.principal.id) ?? []).map(
      (session) => ({
        scope: { tier: "session" as const, id: session.id },
        label: session.title,
      }),
    ),
  ];
  const scopes: Array<{
    scope: ResourceScope;
    label: string;
    files: SessionArtifactMetadata[];
  }> = [];
  for (const candidate of candidates) {
    try {
      scopes.push({
        ...candidate,
        files: await input.artifacts.listByScope(
          candidate.scope,
          input.principal,
        ),
      });
    } catch (error) {
      if (error instanceof ArtifactScopeAccessDeniedError) continue;
      throw error;
    }
  }

  const resources = new Map<
    string,
    Omit<SessionArtifactMetadata, "scope"> & {
      availableIn: ResourceScope[];
    }
  >();
  for (const entry of scopes) {
    for (const file of entry.files) {
      const existing = resources.get(file.id);
      if (existing) {
        existing.availableIn.push(entry.scope);
        continue;
      }
      const { scope: _scope, ...metadata } = file;
      resources.set(file.id, {
        ...metadata,
        availableIn: [entry.scope],
      });
    }
  }

  return {
    scopes: scopes.map(({ files: _files, ...scope }) => scope),
    resources: [...resources.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}

function requirePrincipalReach(
  ctx: ToolContext,
): NonNullable<ToolContext["auth"]>["principal"] {
  if (!isRecord(ctx.host) || ctx.host.agentReach !== "principal") {
    throw new Error(
      "Principal-wide resource discovery requires a personal agent session.",
    );
  }
  const principal = ctx.auth?.principal;
  if (!principal || principal.kind !== "human") {
    throw new Error(
      "Principal-wide resource discovery requires an authenticated human principal.",
    );
  }
  return principal;
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

export function isResourceScope(value: unknown): value is ResourceScope {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "tier" || key === "id") &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.tier === "string" &&
    (RESOURCE_SCOPE_TIERS as readonly string[]).includes(value.tier) &&
    normalizeScope(value as unknown as ScopeInput) !== undefined
  );
}

export function requireResourceScope(
  requested: ResourceScope | undefined,
  ctx: ToolContext,
): ResourceScope {
  const hostScope = requestScope(ctx);
  const principalReach =
    isRecord(ctx.host) && ctx.host.agentReach === "principal";
  // The app-controlled turn scope (x-sigil-scope, e.g. the Evidence Room's
  // registered personal project) is AUTHORITATIVE and wins over any
  // model-supplied scope.
  // The model routinely guesses a wrong scope (a focused doc's id, the route
  // name), which previously clobbered the correct corpus; letting the model
  // redirect a tool to a scope the workspace didn't authorize is also a
  // scope-confusion hazard. The requested scope is only a fallback when the host
  // set none.
  const scope = normalizeScope(
    principalReach && requested ? requested : hostScope ?? requested,
  );
  if (!scope) {
    throw new Error(
      "File tools require a resource scope, either in the request or in the tool input.",
    );
  }
  return scope;
}

function requestScope(ctx: ToolContext): ResourceScope | undefined {
  if (!isRecord(ctx.host)) return undefined;
  return normalizeScope(ctx.host.resourceScope as ScopeInput | undefined);
}

export function resourceScopeSchema(): Record<string, unknown> {
  return objectSchema(
    {
      tier: { type: "string", enum: RESOURCE_SCOPE_TIERS },
      id: { type: "string", minLength: 1 },
    },
    ["tier", "id"],
  );
}

export function isTextualFile(artifact: SessionArtifactMetadata): boolean {
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
  const extension = /\.([a-z0-9]+)$/i
    .exec(artifact.filename)?.[1]
    ?.toLowerCase();
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
