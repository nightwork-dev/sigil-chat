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
  canAccess(principalId: string, scopeId: string): boolean;
  canonicalDescendants(scopeId: string): readonly string[];
  rollupSubjects(scopeId: string): readonly string[];
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
    canAccess(principalId, scopeId) {
      const scope = registries.scopes.get(scopeId);
      if (!scope || (scope.kind !== "project" && scope.kind !== "workspace")) {
        return false;
      }
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
        if (!access.canAccess(principalId, rootScopeId)) continue;
        const scopeIds =
          traversal === "self"
            ? [rootScopeId]
            : resolveRollupScopes(rootScopeId, access);
        for (const scopeId of scopeIds) {
          if (seen.has(scopeId) || !access.canAccess(principalId, scopeId)) {
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
export function canReadBoardView(
  view: BoardView,
  principalId: string,
  access: WorkItemsScopeAccess = currentWorkItemsScopeAccess(),
): boolean {
  return (
    (view.visibility !== "private" ||
      view.ownerPrincipalId === undefined ||
      view.ownerPrincipalId === principalId) &&
    access.canAccess(principalId, view.ownerScopeId) &&
    view.roots.every((scopeId) => access.canAccess(principalId, scopeId))
  );
}

/**
 * Private boards belong to their saving principal. Published boards retain the
 * existing installation-owner mutation policy until SC.3 supplies grants.
 */
export function requireBoardViewMutationAccess(
  session: SigilAuthSession | null,
  view: BoardView,
  access: WorkItemsScopeAccess = currentWorkItemsScopeAccess(),
): SigilAuthSession {
  requireSession(session);
  if (
    !access.canAccess(session.user.id, view.ownerScopeId) ||
    !view.roots.every((scopeId) => access.canAccess(session.user.id, scopeId))
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
