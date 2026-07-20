import type { SigilAuthSession } from "@/lib/auth/server";
import { requireSession } from "@/lib/auth/session";

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
