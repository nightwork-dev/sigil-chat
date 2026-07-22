// §3.1 — the ActiveContainerProvider: the single app-level source for "which
// project/workspace am I in." Every scoped surface reads the selection from
// here instead of re-deriving it; the shell switcher and the omnibar write it
// through the same mutation, so chrome and keyboard paths can never disagree.
//
// Selection semantics (mirrors the preference contract):
// - no selection → the principal's personal project (project scope)
// - project only → project scope, no specific workspace
// - workspace → that workspace; the containing project is derived through the
//   registry (never trusted from the client — the server fn re-derives it)
//
// Persistence is the per-principal active-thread preference store (extended,
// not forked — the PROJ.2 "same store, keyed by scope" rule).

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  useActiveAgentThreadPreference,
  useSetActiveContainer,
} from "@/lib/agent-threads";
import type {
  AgentThreadPreference,
  ScopePerspective,
} from "@/lib/agent-threads-domain";
import {
  useProjectWorkspaceNav,
  type ProjectWorkspaceNavSummary,
} from "@/lib/project-workspace-nav";

export interface ActiveContainer {
  perspective: ScopePerspective | undefined;
  /** Always resolved once nav data loads — defaults to the personal project. */
  projectId: string | undefined;
  workspaceId: string | undefined;
  projectName: string | undefined;
  workspaceName: string | undefined;
  /** True once the preference + nav queries have both resolved. */
  isReady: boolean;
  selectProject: (projectId: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  /** Back to the default: personal project, no workspace. */
  clear: () => void;
}

const ActiveContainerContext = createContext<ActiveContainer | null>(null);

export function resolveActiveContainerSelection(
  preference: AgentThreadPreference | undefined,
  nav: ProjectWorkspaceNavSummary | undefined,
): Pick<
  ActiveContainer,
  | "perspective"
  | "projectId"
  | "workspaceId"
  | "projectName"
  | "workspaceName"
> {
  const perspective = preference?.activePerspective;
  const workspace = nav?.workspaces.find(
    (entry) => entry.id === perspective?.focusScopeId,
  );
  const focusProject = nav?.projects.find(
    (project) => project.id === perspective?.focusScopeId,
  );
  // A directly granted workspace can be visible while its canonical project
  // is not. Only an already-visible via crumb becomes the legacy project
  // projection; do not recover a hidden canonical home or substitute personal.
  const projectId = workspace
    ? perspective?.viaScopeIds.at(-1)
    : focusProject?.id ?? nav?.personalProjectId;
  const project = nav?.projects.find((entry) => entry.id === projectId);

  return {
    perspective: workspace || focusProject ? perspective : undefined,
    projectId,
    workspaceId: workspace?.id,
    projectName: project?.name,
    workspaceName: workspace?.name,
  };
}

export function ActiveContainerProvider({ children }: { children: ReactNode }) {
  const preference = useActiveAgentThreadPreference();
  const nav = useProjectWorkspaceNav();
  const setActiveContainer = useSetActiveContainer();

  const value = useMemo<ActiveContainer>(() => {
    const selection = resolveActiveContainerSelection(preference.data, nav.data);

    return {
      ...selection,
      isReady: Boolean(preference.data && nav.data),
      selectProject: (pid) =>
        setActiveContainer.mutate({
          perspective: { focusScopeId: pid, viaScopeIds: [] },
        }),
      selectWorkspace: (wid) =>
        setActiveContainer.mutate({
          perspective: {
            focusScopeId: wid,
            viaScopeIds: selection.projectId ? [selection.projectId] : [],
          },
        }),
      clear: () => setActiveContainer.mutate({}),
    };
  }, [preference.data, nav.data, setActiveContainer]);

  return (
    <ActiveContainerContext.Provider value={value}>
      {children}
    </ActiveContainerContext.Provider>
  );
}

export function useActiveContainer(): ActiveContainer {
  const ctx = useContext(ActiveContainerContext);
  if (!ctx) {
    throw new Error(
      "useActiveContainer must be used within <ActiveContainerProvider>.",
    );
  }
  return ctx;
}
