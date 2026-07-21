import { shape, type ToolContext, type ToolRegistry } from "@gonk/tool-registry"

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
  expectedRevision?: number
}

type WorkspaceListInput = {
  projectId?: string
}

type WorkspaceInspectInput = {
  id: string
}

type WorkspaceUpsertInput = {
  workspace: Workspace
  expectedRevision?: number
}

export interface ContainerRegistries {
  projects: Pick<ProjectRegistry, "get" | "hasMember" | "list" | "upsert">
  workspaces: Pick<WorkspaceRegistry, "get" | "list" | "upsert">
}

export function registerContainerTools(
  registry: ToolRegistry,
  containers: ContainerRegistries,
): void {
  registry.register({
    name: "sigil-project-list",
    description:
      "List durable project summaries for projects where the authenticated principal is a current member.",
    visibility: "always",
    approval: "read",
    input: shape<ProjectListInput>(isEmptyObject, "Expected an empty object."),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async (_input, ctx) => {
      const principalId = requireHumanPrincipal(ctx)
      return {
        data: {
          projects: containers.projects
            .list()
            .filter((project) =>
              project.members.some(
                (member) => member.principalId === principalId,
              ),
            )
            .map((project) => projectSummary(project, principalId)),
        },
      }
    },
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
    handler: async (input, ctx) => {
      const principalId = requireHumanPrincipal(ctx)
      const project = containers.projects.get(input.id)
      if (!project || !hasProjectMember(project, principalId)) {
        throw new Error("Project is not available.")
      }
      return { data: { project } }
    },
  })

  registry.register({
    name: "sigil-project-upsert",
    description:
      "Create a durable project for the authenticated principal, or update an existing project as one of its current owners. Updates require expectedRevision.",
    visibility: "always",
    approval: "write",
    input: shape<ProjectUpsertInput>(
      isProjectUpsertInput,
      "Expected a complete project record with unique owner or member principals and an optional integer expectedRevision.",
    ),
    inputJsonSchema: objectSchema(
      {
        project: projectSchema(),
        expectedRevision: { type: "integer", minimum: 1 },
      },
      ["project"],
    ),
    hints: writeHints,
    handler: async (input, ctx) => {
      const principalId = requireHumanPrincipal(ctx)
      const current = containers.projects.get(input.project.id)
      const project = current
        ? updateProject(
            input.project,
            current,
            principalId,
            input.expectedRevision,
          )
        : createProject(input.project, principalId, input.expectedRevision)
      const persisted = containers.projects.upsert(
        project,
        revisionOptions(input.expectedRevision),
      )
      return {
        data: {
          project: persisted,
          clientCommand: clientCommand(
            PROJECTS_RESOURCE_KIND,
            persisted.id,
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
    handler: async (input, ctx) => {
      const principalId = requireHumanPrincipal(ctx)
      const projects = memberProjects(containers, principalId)
      if (input.projectId !== undefined) {
        if (!projects.has(input.projectId)) {
          throw new Error("Workspace is not available.")
        }
        return {
          data: { workspaces: containers.workspaces.list(input.projectId) },
        }
      }
      return {
        data: {
          workspaces: containers.workspaces
            .list()
            .filter((workspace) =>
              projects.has(workspace.homeScopeId ?? workspace.projectId),
            ),
        },
      }
    },
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
    handler: async (input, ctx) => {
      const principalId = requireHumanPrincipal(ctx)
      const workspace = containers.workspaces.get(input.id)
      if (
        !workspace ||
        !containers.projects.hasMember(
          workspace.homeScopeId ?? workspace.projectId,
          principalId,
        )
      ) {
        throw new Error("Workspace is not available.")
      }
      return { data: { workspace } }
    },
  })

  registry.register({
    name: "sigil-workspace-upsert",
    description:
      "Create or update a workspace inside a project where the authenticated principal is a current member. Updates require expectedRevision and cannot move the canonical project.",
    visibility: "always",
    approval: "write",
    input: shape<WorkspaceUpsertInput>(
      isWorkspaceUpsertInput,
      "Expected a complete workspace record for an existing project and an optional integer expectedRevision.",
    ),
    inputJsonSchema: objectSchema(
      {
        workspace: workspaceSchema(),
        expectedRevision: { type: "integer", minimum: 1 },
      },
      ["workspace"],
    ),
    hints: writeHints,
    handler: async (input, ctx) => {
      const principalId = requireHumanPrincipal(ctx)
      const current = containers.workspaces.get(input.workspace.id)
      const workspace = current
        ? updateWorkspace(
            input.workspace,
            current,
            containers,
            principalId,
            input.expectedRevision,
          )
        : createWorkspace(input.workspace, containers, principalId)
      const persisted = containers.workspaces.upsert(
        workspace,
        revisionOptions(input.expectedRevision),
      )
      return {
        data: {
          workspace: persisted,
          clientCommand: clientCommand(
            WORKSPACES_RESOURCE_KIND,
            persisted.id,
            "workspace.upsert",
          ),
        },
      }
    },
  })
}

function requireHumanPrincipal(ctx: ToolContext): string {
  const principal = ctx.auth?.principal
  if (
    principal?.kind !== "human" ||
    !isNonEmptyString(principal.id) ||
    !Array.isArray(principal.scopes) ||
    principal.scopes.length === 0
  ) {
    throw new Error("Container registry is not available.")
  }
  return principal.id
}

function projectSummary(project: Project, principalId: string) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    icon: project.icon,
    createdAt: project.createdAt,
    createdBy: project.createdBy,
    revision: project.revision,
    role:
      project.members.find((member) => member.principalId === principalId)
        ?.role ?? "member",
  }
}

function memberProjects(
  containers: ContainerRegistries,
  principalId: string,
): Set<string> {
  return new Set(
    containers.projects
      .list()
      .filter((project) => hasProjectMember(project, principalId))
      .map((project) => project.id),
  )
}

function createProject(
  project: Project,
  principalId: string,
  expectedRevision: number | undefined,
): Project {
  if (expectedRevision !== undefined) {
    throw new Error("Project is not available.")
  }
  const { revision: _revision, ...rest } = project
  return {
    ...rest,
    createdBy: principalId,
    members: [{ principalId, role: "owner" }],
  }
}

function updateProject(
  project: Project,
  current: Project,
  principalId: string,
  expectedRevision: number | undefined,
): Project {
  if (expectedRevision === undefined) {
    throw new Error("Project revision is required.")
  }
  if (!hasProjectOwner(current, principalId)) {
    throw new Error("Project is not available.")
  }
  if (!project.members.some((member) => member.role === "owner")) {
    throw new Error("Project must keep at least one owner.")
  }
  return { ...project, id: current.id, createdAt: current.createdAt }
}

function createWorkspace(
  workspace: Workspace,
  containers: ContainerRegistries,
  principalId: string,
): Workspace {
  const homeScopeId = workspace.homeScopeId ?? workspace.projectId
  if (!containers.projects.hasMember(homeScopeId, principalId)) {
    throw new Error("Workspace is not available.")
  }
  const { revision: _revision, ...rest } = workspace
  return {
    ...rest,
    projectId: homeScopeId,
    homeScopeId,
    createdBy: principalId,
  }
}

function updateWorkspace(
  workspace: Workspace,
  current: Workspace,
  containers: ContainerRegistries,
  principalId: string,
  expectedRevision: number | undefined,
): Workspace {
  if (expectedRevision === undefined) {
    throw new Error("Workspace revision is required.")
  }
  const currentHome = current.homeScopeId ?? current.projectId
  const nextHome = workspace.homeScopeId ?? workspace.projectId
  if (currentHome !== nextHome || workspace.projectId !== nextHome) {
    throw new Error("Workspace canonical project cannot change.")
  }
  if (!containers.projects.hasMember(currentHome, principalId)) {
    throw new Error("Workspace is not available.")
  }
  return {
    ...workspace,
    id: current.id,
    projectId: currentHome,
    homeScopeId: currentHome,
    createdAt: current.createdAt,
  }
}

function hasProjectMember(project: Project, principalId: string): boolean {
  return project.members.some((member) => member.principalId === principalId)
}

function hasProjectOwner(project: Project, principalId: string): boolean {
  return project.members.some(
    (member) => member.principalId === principalId && member.role === "owner",
  )
}

function revisionOptions(expectedRevision: number | undefined) {
  return expectedRevision === undefined ? {} : { expectedRevision }
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
    hasOnlyKeys(value, ["project", "expectedRevision"]) &&
    isProject(value.project) &&
    isOptionalRevisionInput(value.expectedRevision)
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
    hasOnlyKeys(value, ["workspace", "expectedRevision"]) &&
    isWorkspace(value.workspace) &&
    isOptionalRevisionInput(value.expectedRevision)
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
      "icon",
      "revision",
    ]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.description === "string" &&
    Array.isArray(value.members) &&
    value.members.every(isProjectMember) &&
    hasUniquePrincipalIds(value.members) &&
    isJsonRecord(value.settings) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.createdBy) &&
    isOptionalRevisionInput(value.revision)
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
      "homeScopeId",
      "name",
      "description",
      "icon",
      "status",
      "createdAt",
      "createdBy",
      "revision",
    ]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.projectId) &&
    (value.homeScopeId === undefined || isNonEmptyString(value.homeScopeId)) &&
    isNonEmptyString(value.name) &&
    typeof value.description === "string" &&
    (value.status === "active" || value.status === "archived") &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.createdBy) &&
    isOptionalRevisionInput(value.revision)
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

function isOptionalRevisionInput(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
  )
}

function projectSchema(): Record<string, unknown> {
  return objectSchema(
    {
      id: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      icon: { type: "string" },
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
      revision: { type: "integer", minimum: 1 },
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
      homeScopeId: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      icon: { type: "string" },
      status: { type: "string", enum: ["active", "archived"] },
      createdAt: { type: "string", minLength: 1 },
      createdBy: { type: "string", minLength: 1 },
      revision: { type: "integer", minimum: 1 },
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
