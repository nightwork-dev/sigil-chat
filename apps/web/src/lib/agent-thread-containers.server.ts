import { getProjectWorkspaceRegistries } from "../../../agent/agent/lib/project-workspace-registries";
import {
  ensurePersonalProject,
  personalProjectId as derivePersonalProjectId,
} from "../../../agent/agent/lib/personal-project";
import type { Project } from "../../../agent/agent/lib/project-registry";
import type { Workspace } from "../../../agent/agent/lib/workspace-registry";

import {
  deriveThreadProjectId,
  type WorkspaceContainmentLookup,
} from "@/lib/agent-thread-containers";
import type { AgentThreadSummary } from "@/lib/agent-threads-domain";
import type { ScopePerspective } from "@/lib/agent-threads-domain";

export interface NavigableWorkspace extends Workspace {
  /** Additional projects from which this workspace may be entered. */
  mountedProjectIds: string[];
}

export interface ProjectWorkspaceNav {
  personalProjectId: string;
  /** Every project the principal is a member of, personal project included. */
  projects: Project[];
  /** Every canonical or mounted workspace visible from those projects. */
  workspaces: NavigableWorkspace[];
}

function registryLookup(
  workspaces: readonly NavigableWorkspace[],
): WorkspaceContainmentLookup {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  return {
    getWorkspaceProjectId: (workspaceId) =>
      byId.get(workspaceId)?.homeScopeId ?? byId.get(workspaceId)?.projectId,
  };
}

/**
 * The nav data a principal needs to render the project switcher + workspace
 * list: the seeded personal project, every project they belong to, and every
 * workspace inside those projects. Seeding is idempotent and lazy (mirrors
 * the persona first-boot seed) — called once per request, not at import
 * time, so importing this module never opens Mirk's store.
 */
export function loadProjectWorkspaceNav(principalId: string): ProjectWorkspaceNav {
  const registries = getProjectWorkspaceRegistries();
  ensurePersonalProject(registries.projects, principalId);
  const projects = registries.projects
    .list()
    .filter((project) =>
      project.members.some((member) => member.principalId === principalId),
    );
  const projectIds = new Set(projects.map((project) => project.id));
  const mountedProjectIdsByWorkspace = new Map<string, string[]>();
  for (const link of registries.links.list("mounted-in")) {
    if (!projectIds.has(link.targetScopeId)) continue;
    if (!registries.workspaces.get(link.subjectScopeId)) continue;
    const mountedProjectIds =
      mountedProjectIdsByWorkspace.get(link.subjectScopeId) ?? [];
    mountedProjectIds.push(link.targetScopeId);
    mountedProjectIdsByWorkspace.set(link.subjectScopeId, mountedProjectIds);
  }
  const workspaces = registries.workspaces
    .list()
    .filter(
      (workspace) =>
        projectIds.has(workspace.homeScopeId ?? workspace.projectId) ||
        mountedProjectIdsByWorkspace.has(workspace.id),
    )
    .map((workspace) => ({
      ...workspace,
      mountedProjectIds: [
        ...new Set(mountedProjectIdsByWorkspace.get(workspace.id) ?? []),
      ].sort(),
    }));

  return {
    personalProjectId: derivePersonalProjectId(principalId),
    projects,
    workspaces,
  };
}

export interface PerspectiveResolution {
  perspective: ScopePerspective;
  /** Undefined only when the requested path was valid. */
  diagnostic?: "scope-perspective-fallback";
}

/**
 * Compatibility fields may only project an already-visible entry crumb. A
 * workspace's canonical home remains server-side when that project is hidden.
 */
export function legacyContainerProjection(
  perspective: ScopePerspective,
  nav: ProjectWorkspaceNav,
): { projectId?: string; workspaceId?: string } {
  const workspace = nav.workspaces.find(
    (entry) => entry.id === perspective.focusScopeId,
  );
  return workspace
    ? {
        ...(perspective.viaScopeIds.at(-1)
          ? { projectId: perspective.viaScopeIds.at(-1) }
          : {}),
        workspaceId: workspace.id,
      }
    : { projectId: perspective.focusScopeId };
}

/**
 * Validates the product's current project/workspace perspective shape. This
 * is display resolution, not authorization: resource access remains checked
 * against real identities elsewhere.
 */
export function resolveScopePerspective(
  requested: ScopePerspective,
  nav: ProjectWorkspaceNav,
): PerspectiveResolution | undefined {
  const projectIds = new Set(nav.projects.map((project) => project.id));
  const project = nav.projects.find((entry) => entry.id === requested.focusScopeId);
  if (project) {
    if (requested.viaScopeIds.length === 0) {
      return { perspective: { focusScopeId: project.id, viaScopeIds: [] } };
    }
    return {
      perspective: { focusScopeId: project.id, viaScopeIds: [] },
      diagnostic: "scope-perspective-fallback",
    };
  }

  const workspace = nav.workspaces.find(
    (entry) => entry.id === requested.focusScopeId,
  );
  if (!workspace) return undefined;
  const canonicalProjectId = workspace.homeScopeId ?? workspace.projectId;
  const permittedEntryProjectIds = new Set([
    canonicalProjectId,
    ...workspace.mountedProjectIds,
  ]);
  const validVia =
    requested.viaScopeIds.length === 1 &&
    projectIds.has(requested.viaScopeIds[0]) &&
    permittedEntryProjectIds.has(requested.viaScopeIds[0]);
  if (validVia) {
    return {
      perspective: {
        focusScopeId: workspace.id,
        viaScopeIds: [requested.viaScopeIds[0]],
      },
    };
  }
  const fallbackVia = projectIds.has(canonicalProjectId)
    ? [canonicalProjectId]
    : [];
  return {
    perspective: { focusScopeId: workspace.id, viaScopeIds: fallbackVia },
    diagnostic: "scope-perspective-fallback",
  };
}

/**
 * The containment lookup a thread summary needs to resolve its project id
 * through the registry (never a stored field — spec §1). Callers pass this
 * plus the principal's personal project id to
 * `deriveThreadProjectId`/`threadsForProject` in agent-thread-containers.ts.
 */
export function threadProjectId(
  thread: Pick<AgentThreadSummary, "workspaceId">,
  nav: ProjectWorkspaceNav,
): string {
  return deriveThreadProjectId(thread, registryLookup(nav.workspaces), nav.personalProjectId);
}
