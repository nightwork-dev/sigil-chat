import { getProjectWorkspaceRegistries } from "../../../agent/agent/lib/project-workspace-registries"
import {
  createScopeGrantPolicy,
  type ScopeAuthorizationRegistries,
} from "../../../agent/agent/lib/scope-authorization"
import type {
  ScopeAuthorizationAction,
  ScopeAuthorizationPolicy,
} from "@workspace/agent-contracts/scope-authorization"
import { personalScopeId } from "../../../agent/agent/lib/personal-scope"

export type OwnedThreadHomeScope = (
  userId: string,
  threadId: string,
) => string | undefined

export function assertAuthorizedScope(
  scope: string,
  userId: string,
  ownedThreadHomeScope: OwnedThreadHomeScope,
  registries?: ScopeAuthorizationRegistries,
  policy?: ScopeAuthorizationPolicy,
  action: ScopeAuthorizationAction = "read",
): void {
  const match = /^(session|workspace|project|persona):([^\s:][^\s]*)$/.exec(
    scope,
  )
  if (!match) throw new Error("Agent resource scope is invalid.")
  if (match[1] === "session") {
    const homeScopeId = ownedThreadHomeScope(userId, match[2]!)
    if (!homeScopeId) {
      throw new Error("Agent session was not found.")
    }
    if (homeScopeId === personalScopeId(userId)) return
    const resolvedRegistries = registries ?? getProjectWorkspaceRegistries()
    const homeScope = resolvedRegistries.workspaces.get(homeScopeId)
      ? `workspace:${homeScopeId}`
      : resolvedRegistries.projects.get(homeScopeId)
        ? `project:${homeScopeId}`
        : undefined
    if (!homeScope) throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
    const authorization =
      policy ?? createScopeGrantPolicy({ registries: resolvedRegistries })
    if (
      !authorization.authorize({
        action,
        principalId: userId,
        resourceScope: homeScope,
      })
    ) {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
    }
    return
  }
  if (match[1] === "project" || match[1] === "workspace") {
    const resolvedRegistries = registries ?? getProjectWorkspaceRegistries()
    const id = match[2]!
    const registered =
      match[1] === "project"
        ? resolvedRegistries.projects.get(id) !== undefined
        : resolvedRegistries.workspaces.get(id) !== undefined
    if (registered) {
      const authorization =
        policy ?? createScopeGrantPolicy({ registries: resolvedRegistries })
      if (
        !authorization.authorize({
          action,
          principalId: userId,
          resourceScope: scope,
        })
      ) {
        throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
      }
      return
    }
    // Legacy unregistered scope ids stay possession-gated until migration.
    if (match[1] === "project" && id === "evidence-room") return
  }
  throw new Error("Agent resource scope is not available to this application.")
}
