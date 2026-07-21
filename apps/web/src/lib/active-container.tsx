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
import { useProjectWorkspaceNav } from "@/lib/project-workspace-nav";

export interface ActiveContainer {
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

export function ActiveContainerProvider({ children }: { children: ReactNode }) {
  const preference = useActiveAgentThreadPreference();
  const nav = useProjectWorkspaceNav();
  const setActiveContainer = useSetActiveContainer();

  const value = useMemo<ActiveContainer>(() => {
    const pref = preference.data;
    const data = nav.data;

    const workspace = data?.workspaces.find(
      (w) => w.id === pref?.activeWorkspaceId,
    );
    // Containment wins over the stored project field — same derivation rule
    // as threads. A stored workspace whose project disagrees with the stored
    // project resolves through the workspace.
    const projectId =
      workspace?.projectId ?? pref?.activeProjectId ?? data?.personalProjectId;
    const project = data?.projects.find((p) => p.id === projectId);

    return {
      projectId,
      workspaceId: workspace?.id,
      projectName: project?.name,
      workspaceName: workspace?.name,
      isReady: Boolean(preference.data && nav.data),
      selectProject: (pid) => setActiveContainer.mutate({ projectId: pid }),
      selectWorkspace: (wid) => setActiveContainer.mutate({ workspaceId: wid }),
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
