import { relative, resolve } from "node:path"

import {
  ScopedKnowledgeStore,
  type ScopedKnowledgeAuthority,
  type ScopedKnowledgeAuthDecision,
  type ScopedKnowledgeGet,
  type ScopedKnowledgeQuery,
  type ScopedKnowledgeRole,
  type ScopedKnowledgeWrite,
} from "@gonk/knowledge/scoped"
import {
  KNOWLEDGE_CATEGORIES,
  type KnowledgeContainerRef,
  type KnowledgePageRef,
} from "@gonk/knowledge/types"
import {
  shape,
  type ToolContext,
  type ToolDefinition,
} from "@gonk/tool-registry"
import { normalizeScope } from "@workspace/artifact-store/scope"
import { readDataEnvironment } from "@workspace/runtime-env/server"

import type { ProjectWorkspaceRegistries } from "./project-workspace-registries"

export interface SigilScopedKnowledgeOptions {
  registries: Pick<ProjectWorkspaceRegistries, "projects" | "workspaces">
  rootDir?: string
  scanWrites?: (text: string) => { allowed: boolean; reason?: string }
}

export function createSigilScopedKnowledgeStore(
  options: SigilScopedKnowledgeOptions,
): ScopedKnowledgeStore {
  const root = resolve(
    options.rootDir ?? readDataEnvironment(process.env).rootDir,
    "knowledge",
  )
  return new ScopedKnowledgeStore({
    authority: createSigilScopedKnowledgeAuthority(options.registries),
    containerHome: (container) => containerHome(root, container),
    scanWrites: options.scanWrites,
  })
}

export function createSigilScopedKnowledgeTools(
  store: ScopedKnowledgeStore,
): readonly ToolDefinition[] {
  return [
    {
      name: "scoped_knowledge_query",
      description:
        "Search knowledge visible from the active Sigil Chat project/workspace. The active container is derived from the verified host resource scope; callers cannot choose another project or workspace.",
      visibility: "always",
      approval: "read",
      input: querySchema,
      inputJsonSchema: queryJsonSchema,
      handler: async (input, ctx) => {
        const query = input as SigilScopedKnowledgeQueryInput
        return {
          data: await store.query({
            ...query,
            principal: trustedPrincipal(ctx, "scoped_knowledge_query"),
            activeContainer: activeKnowledgeContainer(
              ctx,
              "scoped_knowledge_query",
            ),
          }),
        }
      },
    },
    {
      name: "scoped_knowledge_get",
      description:
        "Read a knowledge page visible from the active Sigil Chat project/workspace. The active container is derived from verified host scope.",
      visibility: "on-demand",
      approval: "read",
      input: getSchema,
      inputJsonSchema: getJsonSchema,
      handler: async (input, ctx) => {
        const get = input as SigilScopedKnowledgeGetInput
        return {
          data: await store.get({
            ...get,
            principal: trustedPrincipal(ctx, "scoped_knowledge_get"),
            activeContainer: activeKnowledgeContainer(
              ctx,
              "scoped_knowledge_get",
            ),
          }),
        }
      },
    },
    {
      name: "scoped_knowledge_links",
      description:
        "List backlinks visible from the active Sigil Chat project/workspace. The active container is derived from verified host scope.",
      visibility: "on-demand",
      approval: "read",
      input: getSchema,
      inputJsonSchema: getJsonSchema,
      handler: async (input, ctx) => {
        const get = input as SigilScopedKnowledgeGetInput
        return {
          data: await store.links({
            ...get,
            principal: trustedPrincipal(ctx, "scoped_knowledge_links"),
            activeContainer: activeKnowledgeContainer(
              ctx,
              "scoped_knowledge_links",
            ),
          }),
        }
      },
    },
    {
      name: "scoped_knowledge_write",
      description:
        "Write knowledge only to the active Sigil Chat project/workspace. The target container is derived from the verified host resource scope; callers cannot choose another project or workspace.",
      visibility: "always",
      approval: "write",
      input: writeSchema,
      inputJsonSchema: writeJsonSchema,
      handler: async (input, ctx) => {
        const write = input as SigilScopedKnowledgeWriteInput
        return {
          data: await store.write({
            ...write,
            principal: trustedPrincipal(ctx, "scoped_knowledge_write"),
            targetContainer: activeKnowledgeContainer(
              ctx,
              "scoped_knowledge_write",
            ),
          }),
        }
      },
    },
  ]
}

export function createSigilScopedKnowledgeAuthority(
  registries: Pick<ProjectWorkspaceRegistries, "projects" | "workspaces">,
): ScopedKnowledgeAuthority {
  return {
    resolveWorkspaceParentProject: (workspaceId) => {
      const workspace = registries.workspaces.get(workspaceId)
      return workspace?.homeScopeId ?? workspace?.projectId
    },
    authorizeRead: ({ principal, container }) =>
      roleForPrincipal(registries, principal.principalId, container, "read"),
    authorizeWrite: ({ principal, container }) =>
      roleForPrincipal(registries, principal.principalId, container, "write"),
  }
}

export function containerHome(
  root: string,
  container: KnowledgeContainerRef,
): string | undefined {
  if (container.tier !== "project" && container.tier !== "workspace") {
    return undefined
  }
  if (!container.id.trim()) return undefined
  const resolvedRoot = resolve(root)
  const encodedId = encodeURIComponent(container.id)
  const home = resolve(resolvedRoot, container.tier, encodedId)
  const relation = relative(resolvedRoot, home)
  if (
    relation === "" ||
    relation.startsWith("..") ||
    relation.split(/[\\/]/).includes("..") ||
    relation.startsWith("/") ||
    relation.startsWith("\\")
  ) {
    return undefined
  }
  return home
}

function roleForPrincipal(
  registries: Pick<ProjectWorkspaceRegistries, "projects" | "workspaces">,
  principalId: string,
  container: KnowledgeContainerRef,
  action: "read" | "write",
): ScopedKnowledgeAuthDecision {
  const projectId = projectIdForContainer(registries, container)
  if (!projectId) {
    return {
      allowed: false,
      reason: "unknown project/workspace knowledge container",
    }
  }
  const project = registries.projects.get(projectId)
  const role = project?.members.find(
    (member) => member.principalId === principalId,
  )?.role
  if (!role) {
    return {
      allowed: false,
      reason: "principal is not a member of the knowledge container",
    }
  }
  const scopedRole: ScopedKnowledgeRole =
    role === "owner" ? "owner" : "viewer"
  if (action === "write" && scopedRole !== "owner") {
    return {
      allowed: false,
      role: scopedRole,
      reason: "scoped knowledge writes require project ownership",
    }
  }
  return { allowed: true, role: scopedRole }
}

function projectIdForContainer(
  registries: Pick<ProjectWorkspaceRegistries, "projects" | "workspaces">,
  container: KnowledgeContainerRef,
): string | undefined {
  if (container.tier === "project") {
    return registries.projects.get(container.id) ? container.id : undefined
  }
  if (container.tier === "workspace") {
    const workspace = registries.workspaces.get(container.id)
    return workspace?.homeScopeId ?? workspace?.projectId
  }
  return undefined
}

type SigilScopedKnowledgeQueryInput = Omit<
  ScopedKnowledgeQuery,
  "principal" | "activeContainer"
>

type SigilScopedKnowledgeGetInput = Omit<
  ScopedKnowledgeGet,
  "principal" | "activeContainer"
>

type SigilScopedKnowledgeWriteInput = Omit<
  ScopedKnowledgeWrite,
  "principal" | "targetContainer"
>

function trustedPrincipal(
  ctx: ToolContext,
  toolName: string,
): { principalId: string } {
  const principalId = ctx.auth?.principal?.id
  if (!principalId) {
    throw new Error(`${toolName} requires an authenticated principal`)
  }
  return { principalId }
}

export function activeKnowledgeContainer(
  ctx: ToolContext,
  toolName = "scoped knowledge",
): KnowledgeContainerRef {
  const host = ctx.host as { resourceScope?: unknown } | undefined
  const scope = normalizeScope(
    host?.resourceScope as Parameters<typeof normalizeScope>[0] | undefined,
  )
  if (scope?.tier !== "project" && scope?.tier !== "workspace") {
    throw new Error(
      `${toolName} requires an active project or workspace resource scope`,
    )
  }
  return { tier: scope.tier, id: scope.id }
}

const querySchema = shape<SigilScopedKnowledgeQueryInput>(
  (value): value is SigilScopedKnowledgeQueryInput => {
    if (!isRecord(value)) return false
    return (
      hasOnlyKeys(value, [
        "text",
        "category",
        "tags",
        "linksTo",
        "includeSuperseded",
        "limit",
      ]) &&
      isOptionalString(value.text) &&
      isOptionalString(value.category) &&
      isOptionalStringArray(value.tags) &&
      isOptionalString(value.linksTo) &&
      isOptionalBoolean(value.includeSuperseded) &&
      isOptionalPositiveInteger(value.limit)
    )
  },
  "expected { text?, category?, tags?, linksTo?, includeSuperseded?, limit? }; container is derived from the active host scope",
)

const getSchema = shape<SigilScopedKnowledgeGetInput>(
  (value): value is SigilScopedKnowledgeGetInput => {
    if (!isRecord(value)) return false
    return (
      hasOnlyKeys(value, ["id", "includeSuperseded"]) &&
      isNonEmptyString(value.id) &&
      isOptionalBoolean(value.includeSuperseded)
    )
  },
  "expected { id, includeSuperseded? }; container is derived from the active host scope",
)

const writeSchema = shape<SigilScopedKnowledgeWriteInput>(
  (value): value is SigilScopedKnowledgeWriteInput => {
    if (!isRecord(value)) return false
    return (
      hasOnlyKeys(value, [
        "id",
        "title",
        "body",
        "category",
        "expectedRevision",
        "tags",
        "source",
        "confidence",
        "reason",
        "overrideOf",
        "supersedes",
      ]) &&
      isNonEmptyString(value.id) &&
      isNonEmptyString(value.title) &&
      isNonEmptyString(value.body) &&
      isNonEmptyString(value.category) &&
      isNonNegativeInteger(value.expectedRevision) &&
      isOptionalStringArray(value.tags) &&
      isOptionalString(value.source) &&
      isOptionalConfidence(value.confidence) &&
      isOptionalString(value.reason) &&
      (value.overrideOf === undefined || isPageRef(value.overrideOf)) &&
      (value.supersedes === undefined || isPageRef(value.supersedes))
    )
  },
  "expected { id, title, body, category, expectedRevision, tags?, source?, confidence?, reason?, overrideOf?, supersedes? }; target container is derived from the active host scope",
)

const containerJsonSchema = {
  type: "object",
  properties: {
    tier: { type: "string", enum: ["project", "workspace"] },
    id: { type: "string", minLength: 1 },
  },
  required: ["tier", "id"],
  additionalProperties: false,
} as const

const pageRefJsonSchema = {
  type: "object",
  properties: {
    container: containerJsonSchema,
    id: { type: "string", minLength: 1 },
    revision: { type: "integer", minimum: 1 },
  },
  required: ["container", "id"],
  additionalProperties: false,
} as const

const queryJsonSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    text: { type: "string" },
    category: {
      type: "string",
      description: `Suggested: ${KNOWLEDGE_CATEGORIES.join(", ")}. Free-form allowed.`,
    },
    tags: { type: "array", items: { type: "string" } },
    linksTo: { type: "string" },
    includeSuperseded: { type: "boolean" },
    limit: { type: "integer", minimum: 1 },
  },
  additionalProperties: false,
}

const getJsonSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    includeSuperseded: { type: "boolean" },
  },
  required: ["id"],
  additionalProperties: false,
}

const writeJsonSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    body: { type: "string", minLength: 1 },
    category: {
      type: "string",
      minLength: 1,
      description: `Suggested: ${KNOWLEDGE_CATEGORIES.join(", ")}. Free-form allowed.`,
    },
    expectedRevision: { type: "integer", minimum: 0 },
    tags: { type: "array", items: { type: "string" } },
    source: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
    overrideOf: pageRefJsonSchema,
    supersedes: pageRefJsonSchema,
  },
  required: ["id", "title", "body", "category", "expectedRevision"],
  additionalProperties: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string"
}

function isOptionalStringArray(
  value: unknown,
): value is readonly string[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((item) => typeof item === "string"))
  )
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean"
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function isOptionalPositiveInteger(value: unknown): value is number | undefined {
  return value === undefined || isPositiveInteger(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function isOptionalConfidence(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && value >= 0 && value <= 1)
  )
}

function isPageRef(value: unknown): value is KnowledgePageRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["container", "id", "revision"]) &&
    isKnowledgeContainer(value.container) &&
    isNonEmptyString(value.id) &&
    (value.revision === undefined || isPositiveInteger(value.revision))
  )
}

function isKnowledgeContainer(value: unknown): value is KnowledgeContainerRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["tier", "id"]) &&
    (value.tier === "project" || value.tier === "workspace") &&
    isNonEmptyString(value.id)
  )
}
