import { getProjectWorkspaceRegistries } from "../../../agent/agent/lib/project-workspace-registries"
import {
  assertRegisteredScopeMembership,
  type ScopeAuthorizationRegistries,
} from "../../../agent/agent/lib/scope-authorization"

export function assertAuthorizedScope(
  scope: string,
  userId: string,
  ownsThread: (userId: string, threadId: string) => boolean,
  registries: ScopeAuthorizationRegistries = getProjectWorkspaceRegistries(),
): void {
  const match = /^(session|workspace|project|persona):([^\s:][^\s]*)$/.exec(
    scope,
  )
  if (!match) throw new Error("Agent resource scope is invalid.")
  if (match[1] === "session") {
    if (!ownsThread(userId, match[2]!)) {
      throw new Error("Agent session was not found.")
    }
    return
  }
  if (match[1] === "project" || match[1] === "workspace") {
    const id = match[2]!
    const registered =
      match[1] === "project"
        ? registries.projects.get(id) !== undefined
        : registries.workspaces.get(id) !== undefined
    if (registered) {
      assertRegisteredScopeMembership(scope, userId, registries)
      return
    }
    // Legacy unregistered scope ids stay possession-gated until migration.
    if (match[1] === "project" && id === "evidence-room") return
  }
  throw new Error("Agent resource scope is not available to this application.")
}
