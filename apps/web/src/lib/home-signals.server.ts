import { getProjectWorkspaceRegistries } from "../../../agent/agent/lib/project-workspace-registries"

import { assertAuthorizedScope } from "./agent-scope-authorization.server"
import {
  agentThreadRepository,
  ownedAgentThreadHomeScope,
} from "./agent-threads.server"
import { loadProjectWorkspaceNav } from "./agent-thread-containers.server"
import type { SigilAuthSession } from "./auth/server"
import {
  projectHomeSignals,
  type HomeSignalProjectionInput,
} from "./home-signals-projector"
import type { HomeSignals, HomeSignalsInput } from "./home-signals"

export async function loadHomeSignalsFromRequest(
  input: HomeSignalsInput,
): Promise<HomeSignals> {
  const { getSession, requireSession } = await import("./auth/session")
  const candidate = await getSession()
  const assertSession: (
    value: SigilAuthSession | null,
  ) => asserts value is SigilAuthSession = requireSession
  assertSession(candidate)
  return loadHomeSignals(candidate.user.id, input)
}

export function loadHomeSignals(
  principalId: string,
  input: HomeSignalsInput,
): HomeSignals {
  const scope = normalizeInput(input)
  const registries = getProjectWorkspaceRegistries()
  assertAuthorizedScope(
    `${scope.kind}:${scope.id}`,
    principalId,
    ownedAgentThreadHomeScope,
    registries,
  )
  const threads = agentThreadRepository
    .list(principalId, true)
    .filter((thread) => {
      try {
        assertAuthorizedScope(
          `session:${thread.id}`,
          principalId,
          ownedAgentThreadHomeScope,
          registries,
        )
        return true
      } catch {
        return false
      }
    })
  const projection: HomeSignalProjectionInput = {
    home: scope,
    nav: loadProjectWorkspaceNav(principalId),
    threads,
  }
  return projectHomeSignals(projection)
}

function normalizeInput(input: HomeSignalsInput): HomeSignalsInput {
  if (
    !input ||
    (input.kind !== "project" &&
      input.kind !== "workspace" &&
      input.kind !== "session") ||
    typeof input.id !== "string" ||
    input.id.trim().length === 0
  ) {
    throw new Error("Home signals require a valid scope kind and id.")
  }
  return { id: input.id.trim(), kind: input.kind }
}
