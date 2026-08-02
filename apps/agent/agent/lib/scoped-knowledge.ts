import { relative, resolve } from "node:path"

import {
  ScopedKnowledgeStore,
  bindScopedKnowledgeToTool,
  scopedKnowledgeTools,
  type ScopedKnowledgeAuthority,
  type ScopedKnowledgeAuthDecision,
  type ScopedKnowledgeRole,
} from "@gonk/knowledge/scoped"
import type { KnowledgeContainerRef } from "@gonk/knowledge/types"
import type { ToolDefinition } from "@gonk/tool-registry"
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
  return scopedKnowledgeTools().map((tool) =>
    bindScopedKnowledgeToTool(tool, store),
  )
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
