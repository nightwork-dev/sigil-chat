// §3.1 — the ActiveContainerProvider, DEMOTED by SC.10 §6 step 7, narrowed
// further once `/chat` folded into the session leaf in step 8, and narrowed
// again by §9's session-surface revision. It is no longer "which
// project/workspace am I in" for anything that renders the nested
// projects/workspaces/sessions tree — that tree, INCLUDING the session/chat
// surface now, reads containment from the matched route chain or the
// active-thread preference directly (container-breadcrumb.tsx,
// routes/_app/chat.tsx's resolver), never from this provider. This provider
// is now scoped to three legitimate remaining consumers, none of which reads
// it back to decide what a route renders:
// - The `/home` redirect (routes/_app/home.tsx) — "remember where I was"
//   read, the one place this selection is still authoritative.
// - shell-omnibar.tsx's project/workspace switcher. It WRITES this provider
//   on selection (the persist-on-navigate hook below) and then navigates
//   directly to the picked container's own nested home
//   (/projects/$projectId or /projects/$projectId/workspaces/$workspaceId —
//   never through `/chat`, which would land on the app-global active thread
//   instead of the just-picked container).
// - `ProjectWorkspaceNav`, the session/thread switcher: promoted to a
//   persistent sidebar pane by §9.2 (session-list-pane.tsx, always visible
//   on desktop) and still reachable as a Sheet at compact widths
//   (`AgentSessionSwitcher`, rendered from session-chat-header.tsx now, not
//   AgentChatHeader). Both forms only READ container.projectId, and only as
//   a default filter for their own picker UI — never to choose a navigation
//   target.
// selectProject/selectWorkspace stay wired as a persist-on-navigate hook so
// the next `/home` visit lands where the principal last was — writing here
// is fine; reading it back to decide what a container-scoped route renders
// is exactly the two-writer bug this demotion closes off.
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
