import { getProjectWorkspaceRegistries } from "../../../agent/agent/lib/project-workspace-registries";
import { assertAuthorizedScope } from "./agent-scope-authorization.server";
import type { SigilAuthSession } from "./auth/server";
import { requireOwner, requireSession } from "./auth/session";
import type {
  BoardScopeMatch,
  BoardTraversalResolver,
  BoardView,
} from "@workspace/work-items-store/types";

/**
 * The SC.3 grant service will become the authority for this adapter. Keeping
 * this boundary small prevents the roadmap surface from creating a parallel
 * membership policy while that service is not materialized here yet.
 */
export interface WorkItemsScopeAccess {
  canAccess(input: WorkItemsScopeAuthorizationRequest): boolean;
  canonicalDescendants(scopeId: string): readonly string[];
  rollupSubjects(scopeId: string): readonly string[];
}

export type WorkItemsScopeAction =
  | "board.discover"
  | "board.read"
  | "board.write";

export interface WorkItemsScopeAuthorizationRequest {
  principalId: string;
  scopeId: string;
  action: WorkItemsScopeAction;
}

export function requireWorkItemsMutationAccess(
  session: SigilAuthSession | null,
): SigilAuthSession {
  requireOwner(session)
  return session
}

/**
 * Current application adapter over the established project/workspace scope
 * authorization. It deliberately owns no grant or membership data.
 */
export function currentWorkItemsScopeAccess(): WorkItemsScopeAccess {
  const registries = getProjectWorkspaceRegistries();
  return {
    canAccess({ principalId, scopeId, action }) {
      const scope = registries.scopes.get(scopeId);
      if (!scope || (scope.kind !== "project" && scope.kind !== "workspace")) {
        return false;
      }
      // SC.3 integration point: replace this legacy registry assertion with
      // the grant service's action-exact authorize({ principalId, scopeId,
      // action }) call. Do not collapse these board actions into tool access.
      void action;
      try {
        assertAuthorizedScope(
          `${scope.kind}:${scopeId}`,
          principalId,
          () => false,
          registries,
        );
        return true;
      } catch {
        return false;
      }
    },
    canonicalDescendants(scopeId) {
      const scope = registries.scopes.get(scopeId);
      if (!scope) return [];
      if (scope.kind !== "project") return [scope.id];
      return [
        scope.id,
        ...registries.workspaces
          .list(scope.id)
          .map((workspace) => workspace.id),
      ];
    },
    rollupSubjects(scopeId) {
      return registries.links.traverseSubjects(scopeId, "rolls-up-to");
    },
  };
}

/**
 * Turns the canonical hierarchy plus explicit work-rollup links into the
 * resolver expected by the store. `mounted-in` never enters this traversal:
 * the access adapter exposes only canonical descendants and rolls-up-to
 * subjects. Authorization is checked before a root is expanded and again for
 * every returned scope.
 */
export function createBoardTraversalResolver(
  principalId: string,
  access: WorkItemsScopeAccess = currentWorkItemsScopeAccess(),
): BoardTraversalResolver {
  return {
    resolve(roots, traversal) {
      const matches: BoardScopeMatch[] = [];
      const seen = new Set<string>();
      for (const rootScopeId of roots) {
        if (
          !access.canAccess({
            principalId,
            scopeId: rootScopeId,
            action: "board.read",
          })
        ) {
          continue;
        }
        const scopeIds =
          traversal === "self"
            ? [rootScopeId]
            : resolveRollupScopes(rootScopeId, access);
        for (const scopeId of scopeIds) {
          if (
            seen.has(scopeId) ||
            !access.canAccess({
              principalId,
              scopeId,
              action: "board.read",
            })
          ) {
            continue;
          }
          seen.add(scopeId);
          matches.push({ scopeId, rootScopeId });
        }
      }
      return matches;
    },
  };
}

/** A board is never evaluated if any saved root is outside the viewer grant. */
export function canDiscoverBoardView(
  view: BoardView,
  principalId: string,
  access: WorkItemsScopeAccess = currentWorkItemsScopeAccess(),
): boolean {
  return canAccessBoardView(view, principalId, "board.discover", access);
}

export function canReadBoardView(
  view: BoardView,
  principalId: string,
  access: WorkItemsScopeAccess = currentWorkItemsScopeAccess(),
): boolean {
  return canAccessBoardView(view, principalId, "board.read", access);
}

function canAccessBoardView(
  view: BoardView,
  principalId: string,
  action: "board.discover" | "board.read",
  access: WorkItemsScopeAccess,
): boolean {
  return (
    (view.visibility !== "private" || view.ownerPrincipalId === principalId) &&
    access.canAccess({ principalId, scopeId: view.ownerScopeId, action }) &&
    view.roots.every((scopeId) =>
      access.canAccess({ principalId, scopeId, action }),
    )
  );
}

/**
 * Removes browser-asserted private ownership before persistence. Updating a
 * private board retains its existing owner and refuses a mismatched principal.
 */
export function prepareBoardViewForUpsert(
  view: BoardView,
  principalId: string,
  existing?: BoardView,
): BoardView {
  if (existing?.visibility === "private") {
    if (!existing.ownerPrincipalId || existing.ownerPrincipalId !== principalId) {
      throw new Error("Board view was not found.");
    }
    return { ...view, ownerPrincipalId: existing.ownerPrincipalId };
  }
  return view.visibility === "private"
    ? { ...view, ownerPrincipalId: principalId }
    : view;
}

/**
 * Private boards belong to their saving principal. Published boards retain the
 * existing installation-owner mutation policy until SC.3 supplies grants.
 */
export function requireBoardViewMutationAccess(
  session: SigilAuthSession | null,
  view: BoardView,
  access: WorkItemsScopeAccess = currentWorkItemsScopeAccess(),
  existing?: BoardView,
): SigilAuthSession {
  requireSession(session);
  // Updates retain the authority required by the persisted surface. Otherwise
  // a member who can read a published board could submit the same id as a
  // private board and turn proposed visibility into an authorization bypass.
  if (existing?.visibility === "published") requireOwner(session);
  if (
    existing?.visibility === "private" &&
    existing.ownerPrincipalId !== session.user.id
  ) {
    throw new Error("Board view was not found.");
  }
  if (
    !access.canAccess({
      principalId: session.user.id,
      scopeId: view.ownerScopeId,
      action: "board.write",
    }) ||
    !view.roots.every((scopeId) =>
      access.canAccess({
        principalId: session.user.id,
        scopeId,
        action: "board.write",
      }),
    )
  ) {
    throw new Error("Board view scope is not available to this principal.");
  }
  if (view.visibility === "published") {
    requireOwner(session);
  } else if (
    session.user.role !== "owner" &&
    view.ownerPrincipalId !== session.user.id
  ) {
    throw new Error(
      "Private board views must be owned by the current principal.",
    );
  }
  return session;
}

function resolveRollupScopes(
  rootScopeId: string,
  access: WorkItemsScopeAccess,
): string[] {
  const seen = new Set<string>();
  const queue = [rootScopeId];
  const scopeIds: string[] = [];
  while (queue.length > 0) {
    const scopeId = queue.shift();
    if (!scopeId || seen.has(scopeId)) continue;
    seen.add(scopeId);
    scopeIds.push(scopeId);
    for (const descendant of access.canonicalDescendants(scopeId)) {
      if (!seen.has(descendant)) queue.push(descendant);
    }
    for (const rollupSubject of access.rollupSubjects(scopeId)) {
      if (!seen.has(rollupSubject)) queue.push(rollupSubject);
    }
  }
  return scopeIds;
}
