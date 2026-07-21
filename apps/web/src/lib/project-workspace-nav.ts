import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useAgentPrincipalId } from "@/lib/agent-principal";
import type { SigilAuthSession } from "@/lib/auth/server";

export interface ProjectWorkspaceNavSummary {
  personalProjectId: string;
  projects: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
  }>;
  workspaces: Array<{
    id: string;
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
        name: project.name,
        description: project.description,
        icon: project.icon,
      })),
      workspaces: nav.workspaces.map((workspace) => ({
        id: workspace.id,
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
  all: (principalId: string) => ["project-workspace-nav", principalId] as const,
};

/** Project switcher + workspace list data for the chat surface. Includes
 *  the caller's personal project, seeded on first request. */
export function useProjectWorkspaceNav() {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: projectWorkspaceNavKeys.all(principalId),
    queryFn: () => loadProjectWorkspaceNavFn(),
  });
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
