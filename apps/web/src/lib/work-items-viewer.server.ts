import type { SigilAuthSession } from "@/lib/auth/server";
import { requireSession } from "@/lib/auth/session";
import {
  canDiscoverBoardView,
  canReadBoardView,
  currentWorkItemsScopeAccess,
  type WorkItemsScopeAccess,
} from "@/lib/work-items-access.server";
import type { BoardView } from "@workspace/work-items-store/types";

export interface AuthenticatedWorkItemsViewer {
  id: string;
  role: "owner" | "member";
  username: string | null;
}

/** The only viewer identity accepted by roadmap filtering and comment writes. */
export function authenticatedWorkItemsViewer(
  session: SigilAuthSession | null,
): AuthenticatedWorkItemsViewer {
  requireSession(session);
  return {
    id: session.user.id,
    role: session.user.role,
    username: session.user.username ?? null,
  };
}

/** Filters saved boards before their roots can become browser-visible. */
export function boardViewsVisibleToViewer(
  views: readonly BoardView[],
  viewer: AuthenticatedWorkItemsViewer,
  access: WorkItemsScopeAccess = currentWorkItemsScopeAccess(),
): BoardView[] {
  return views.filter((view) =>
    canDiscoverBoardView(view, viewer.id, access),
  );
}

/**
 * Use one opaque miss for unknown and unauthorized ids so a caller cannot use
 * a board query to discover a hidden board or its roots.
 */
export function boardViewVisibleToViewer(
  view: BoardView | undefined,
  viewer: AuthenticatedWorkItemsViewer,
  access: WorkItemsScopeAccess = currentWorkItemsScopeAccess(),
): BoardView {
  if (!view || !canReadBoardView(view, viewer.id, access)) {
    throw new Error("Board view was not found.");
  }
  return view;
}
