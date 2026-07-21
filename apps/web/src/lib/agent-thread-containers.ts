import type { AgentThreadSummary } from "@/lib/agent-threads-domain";

/**
 * The minimal shape a container-resolution lookup needs from the workspace
 * registry. Kept narrow so client-safe pure functions here never import the
 * Mirk-backed registry types directly (that lives behind .server.ts).
 */
export interface WorkspaceContainmentLookup {
  getWorkspaceProjectId(workspaceId: string): string | undefined;
}

/**
 * Containment is resolved by registry lookup, never by parsing scope ids or
 * duplicating projectId on the thread (spec §1, PROJ.2 acceptance #1 and #5).
 * An unbound thread, or a thread whose workspace the registry no longer
 * recognizes, resolves to the caller's personal project — the zero-config
 * path never dead-ends.
 */
export function deriveThreadProjectId(
  thread: Pick<AgentThreadSummary, "workspaceId">,
  lookup: WorkspaceContainmentLookup,
  personalProjectId: string,
): string {
  if (!thread.workspaceId) return personalProjectId;
  return lookup.getWorkspaceProjectId(thread.workspaceId) ?? personalProjectId;
}

/** Groups threads by their bound workspace id. Threads with no workspaceId
 *  land under the `undefined` key ("unfiled" within their resolved
 *  project) — callers render that bucket, they don't drop it. */
export function groupThreadsByWorkspace<T extends { workspaceId?: string }>(
  threads: readonly T[],
): Map<string | undefined, T[]> {
  const groups = new Map<string | undefined, T[]>();
  for (const thread of threads) {
    const key = thread.workspaceId;
    const bucket = groups.get(key);
    if (bucket) bucket.push(thread);
    else groups.set(key, [thread]);
  }
  return groups;
}

/** Threads whose derived project matches `projectId`, given a containment
 *  lookup and the caller's personal project id. Pure — no I/O. */
export function threadsForProject<T extends { workspaceId?: string }>(
  threads: readonly T[],
  projectId: string,
  lookup: WorkspaceContainmentLookup,
  personalProjectId: string,
): T[] {
  return threads.filter(
    (thread) =>
      deriveThreadProjectId(thread, lookup, personalProjectId) === projectId,
  );
}
