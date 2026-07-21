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

export interface ProjectWorkspaceNav {
  personalProjectId: string;
  /** Every project the principal is a member of, personal project included. */
  projects: Project[];
  /** Every workspace inside those projects. */
  workspaces: Workspace[];
}

function registryLookup(workspaces: readonly Workspace[]): WorkspaceContainmentLookup {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  return {
    getWorkspaceProjectId: (workspaceId) => byId.get(workspaceId)?.projectId,
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
  const workspaces = registries.workspaces
    .list()
    .filter((workspace) => projectIds.has(workspace.projectId));

  return {
    personalProjectId: derivePersonalProjectId(principalId),
    projects,
    workspaces,
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
