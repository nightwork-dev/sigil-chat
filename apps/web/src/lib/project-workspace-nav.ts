import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useAgentPrincipalId } from "@/lib/agent-principal";
import type { SigilAuthSession } from "@/lib/auth/server";

export interface ProjectWorkspaceNavSummary {
  personalProjectId: string;
  projects: Array<{
    id: string;
    /** Short, immutable, URL-friendly alias for `id` (container slugs).
     *  Display/routing only — `id` remains the scope key everywhere
     *  authorization is concerned; resolve slug→id at the route boundary
     *  before any scope-keyed query fires, never pass this through. */
    slug: string;
    name: string;
    description: string;
    icon?: string;
  }>;
  workspaces: Array<{
    id: string;
    /** See projects[].slug — same contract. */
    slug: string;
    /** Present only when the canonical project is visible to this principal. */
    projectId?: string;
    mountedProjectIds: string[];
    name: string;
    description: string;
    icon?: string;
    status: "active" | "archived";
  }>;
}

const loadProjectWorkspaceNavFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProjectWorkspaceNavSummary> => {
    const session = await requireNavSession();
    const { loadProjectWorkspaceNav } = await import(
      "@/lib/agent-thread-containers.server"
    );
    const nav = loadProjectWorkspaceNav(session.user.id);
    return {
      personalProjectId: nav.personalProjectId,
      projects: nav.projects.map((project) => ({
        id: project.id,
        slug: project.slug ?? project.id,
        name: project.name,
        description: project.description,
        icon: project.icon,
      })),
      workspaces: nav.workspaces.map((workspace) => ({
        id: workspace.id,
        slug: workspace.slug ?? workspace.id,
        ...(nav.projects.some(
          (project) =>
            project.id === (workspace.homeScopeId ?? workspace.projectId),
        )
          ? { projectId: workspace.homeScopeId ?? workspace.projectId }
          : {}),
        mountedProjectIds: workspace.mountedProjectIds,
        name: workspace.name,
        description: workspace.description,
        icon: workspace.icon,
        status: workspace.status,
      })),
    };
  },
);

export const projectWorkspaceNavKeys = {
  root: () => ["project-workspace-nav"] as const,
  all: (principalId: string) => ["project-workspace-nav", principalId] as const,
};

export function projectWorkspaceNavQueryOptions(principalId: string) {
  return queryOptions({
    queryKey: projectWorkspaceNavKeys.all(principalId),
    queryFn: () => loadProjectWorkspaceNavFn(),
  });
}

/** Project switcher + workspace list data for the chat surface. Includes
 *  the caller's personal project, seeded on first request. */
export function useProjectWorkspaceNav() {
  const principalId = useAgentPrincipalId();
  return useQuery(projectWorkspaceNavQueryOptions(principalId));
}

async function requireNavSession(): Promise<SigilAuthSession> {
  const { getSession, requireSession } = await import("@/lib/auth/session");
  const session = await getSession();
  const assertSession: (
    candidate: SigilAuthSession | null,
  ) => asserts candidate is SigilAuthSession = requireSession;
  assertSession(session);
  return session;
}
