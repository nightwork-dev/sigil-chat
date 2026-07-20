import { shape, type ToolRegistry } from "@gonk/tool-registry"

import type {
  Project,
  ProjectRegistry,
} from "../../../agent/agent/lib/project-registry.js"
import type {
  Workspace,
  WorkspaceRegistry,
} from "../../../agent/agent/lib/workspace-registry.js"
import { readHints, writeHints } from "./schemas.js"
import { hasOnlyKeys, isRecord } from "./validators.js"

const CONTAINERS_OUTCOME_KIND = "containers.changed"
const PROJECTS_RESOURCE_KIND = "project-registry"
const WORKSPACES_RESOURCE_KIND = "workspace-registry"

type ProjectListInput = Record<string, never>

type ProjectInspectInput = {
  id: string
}

type ProjectUpsertInput = {
  project: Project
}

type WorkspaceListInput = {
  projectId?: string
}

type WorkspaceInspectInput = {
  id: string
}

type WorkspaceUpsertInput = {
  workspace: Workspace
}

export interface ContainerRegistries {
  projects: Pick<ProjectRegistry, "get" | "list" | "upsert">
  workspaces: Pick<WorkspaceRegistry, "get" | "list" | "upsert">
}

export function registerContainerTools(
  registry: ToolRegistry,
  containers: ContainerRegistries,
): void {
  registry.register({
    name: "sigil-project-list",
    description:
      "List the durable projects and their membership records. Inspect a project before replacing it.",
    visibility: "always",
    approval: "read",
    input: shape<ProjectListInput>(isEmptyObject, "Expected an empty object."),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async () => ({ data: { projects: containers.projects.list() } }),
  })

  registry.register({
    name: "sigil-project-inspect",
    description:
      "Inspect one durable project, including its members and settings.",
    visibility: "always",
    approval: "read",
    input: shape<ProjectInspectInput>(
      isProjectInspectInput,
      "Expected a non-empty project id.",
    ),
    inputJsonSchema: objectSchema({ id: { type: "string", minLength: 1 } }, [
      "id",
    ]),
    hints: readHints,
    handler: async (input) => {
      const project = containers.projects.get(input.id)
      if (!project) throw new Error(`Unknown project id: ${input.id}.`)
      return { data: { project } }
    },
  })

  registry.register({
    name: "sigil-project-upsert",
    description:
      "Create or replace a durable project record, including its authoritative members and settings. Inspect first when updating.",
    visibility: "always",
    approval: "write",
    input: shape<ProjectUpsertInput>(
      isProjectUpsertInput,
      "Expected a complete project record with unique owner or member principals.",
    ),
    inputJsonSchema: objectSchema({ project: projectSchema() }, ["project"]),
    hints: writeHints,
    handler: async (input) => {
      const project = containers.projects.upsert(input.project)
      return {
        data: {
          project,
          clientCommand: clientCommand(
            PROJECTS_RESOURCE_KIND,
            project.id,
            "project.upsert",
          ),
        },
      }
    },
  })

  registry.register({
    name: "sigil-workspace-list",
    description:
      "List focused workspaces, optionally only those contained by one project.",
    visibility: "always",
    approval: "read",
    input: shape<WorkspaceListInput>(
      isWorkspaceListInput,
      "Expected an optional non-empty project id.",
    ),
    inputJsonSchema: objectSchema({
      projectId: { type: "string", minLength: 1 },
    }),
    hints: readHints,
    handler: async (input) => ({
      data: { workspaces: containers.workspaces.list(input.projectId) },
    }),
  })

  registry.register({
    name: "sigil-workspace-inspect",
    description: "Inspect one workspace and its containing project id.",
    visibility: "always",
    approval: "read",
    input: shape<WorkspaceInspectInput>(
      isWorkspaceInspectInput,
      "Expected a non-empty workspace id.",
    ),
    inputJsonSchema: objectSchema({ id: { type: "string", minLength: 1 } }, [
      "id",
    ]),
    hints: readHints,
    handler: async (input) => {
      const workspace = containers.workspaces.get(input.id)
      if (!workspace) throw new Error(`Unknown workspace id: ${input.id}.`)
      return { data: { workspace } }
    },
  })

  registry.register({
    name: "sigil-workspace-upsert",
    description:
      "Create or replace a workspace inside an existing project. Inspect first when updating.",
    visibility: "always",
    approval: "write",
    input: shape<WorkspaceUpsertInput>(
      isWorkspaceUpsertInput,
      "Expected a complete workspace record for an existing project.",
    ),
    inputJsonSchema: objectSchema({ workspace: workspaceSchema() }, [
      "workspace",
    ]),
    hints: writeHints,
    handler: async (input) => {
      const workspace = containers.workspaces.upsert(input.workspace)
      return {
        data: {
          workspace,
          clientCommand: clientCommand(
            WORKSPACES_RESOURCE_KIND,
            workspace.id,
            "workspace.upsert",
          ),
        },
      }
    },
  })
}

function clientCommand(resourceKind: string, id: string, operation: string) {
  return {
    type: "agent.domain.outcome" as const,
    payload: {
      id: crypto.randomUUID(),
      kind: CONTAINERS_OUTCOME_KIND,
      resource: { kind: resourceKind, id },
      operation,
      changedIds: [id],
    },
  }
}

function isEmptyObject(value: unknown): value is ProjectListInput {
  return isRecord(value) && Object.keys(value).length === 0
}

function isProjectInspectInput(value: unknown): value is ProjectInspectInput {
  return (
    isRecord(value) && hasOnlyKeys(value, ["id"]) && isNonEmptyString(value.id)
  )
}

function isProjectUpsertInput(value: unknown): value is ProjectUpsertInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["project"]) &&
    isProject(value.project)
  )
}

function isWorkspaceListInput(value: unknown): value is WorkspaceListInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["projectId"]) &&
    (value.projectId === undefined || isNonEmptyString(value.projectId))
  )
}

function isWorkspaceInspectInput(
  value: unknown,
): value is WorkspaceInspectInput {
  return (
    isRecord(value) && hasOnlyKeys(value, ["id"]) && isNonEmptyString(value.id)
  )
}

function isWorkspaceUpsertInput(value: unknown): value is WorkspaceUpsertInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["workspace"]) &&
    isWorkspace(value.workspace)
  )
}

function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "name",
      "description",
      "members",
      "settings",
      "createdAt",
      "createdBy",
    ]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.description === "string" &&
    Array.isArray(value.members) &&
    value.members.every(isProjectMember) &&
    hasUniquePrincipalIds(value.members) &&
    isJsonRecord(value.settings) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.createdBy)
  )
}

function isProjectMember(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["principalId", "role"]) &&
    isNonEmptyString(value.principalId) &&
    (value.role === "owner" || value.role === "member")
  )
}

function hasUniquePrincipalIds(
  members: Array<{ principalId: unknown }>,
): boolean {
  return (
    new Set(members.map((member) => member.principalId)).size === members.length
  )
}

function isWorkspace(value: unknown): value is Workspace {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "projectId",
      "name",
      "description",
      "status",
      "createdAt",
      "createdBy",
    ]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.projectId) &&
    isNonEmptyString(value.name) &&
    typeof value.description === "string" &&
    (value.status === "active" || value.status === "archived") &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.createdBy)
  )
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isJsonValue(value)
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true
  }
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function projectSchema(): Record<string, unknown> {
  return objectSchema(
    {
      id: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      members: {
        type: "array",
        items: objectSchema(
          {
            principalId: { type: "string", minLength: 1 },
            role: { type: "string", enum: ["owner", "member"] },
          },
          ["principalId", "role"],
        ),
      },
      settings: { type: "object", additionalProperties: true },
      createdAt: { type: "string", minLength: 1 },
      createdBy: { type: "string", minLength: 1 },
    },
    [
      "id",
      "name",
      "description",
      "members",
      "settings",
      "createdAt",
      "createdBy",
    ],
  )
}

function workspaceSchema(): Record<string, unknown> {
  return objectSchema(
    {
      id: { type: "string", minLength: 1 },
      projectId: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      status: { type: "string", enum: ["active", "archived"] },
      createdAt: { type: "string", minLength: 1 },
      createdBy: { type: "string", minLength: 1 },
    },
    [
      "id",
      "projectId",
      "name",
      "description",
      "status",
      "createdAt",
      "createdBy",
    ],
  )
}

function emptyObjectSchema(): Record<string, unknown> {
  return { type: "object", properties: {}, additionalProperties: false }
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}
