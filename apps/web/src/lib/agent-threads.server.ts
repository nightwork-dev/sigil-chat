import { createScope } from "@gonk/scope"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import { MirkAgentContextReceiptRepository } from "@workspace/agent-tools/context-receipts"

import { AgentThreadRepository } from "@/lib/agent-threads-domain"
import type {
  AgentThreadExecutionBinding,
  AgentThreadRequestOptions,
} from "@/lib/agent-threads-domain"
import { createThreadBindingService } from "@/lib/agent-thread-bindings.server"
import { resolveSelectableModelPreset } from "@/lib/model-selection.server"
import {
  loadProjectWorkspaceNav,
  resolveScopePerspective,
} from "@/lib/agent-thread-containers.server"
import { getProjectWorkspaceRegistries } from "../../../agent/agent/lib/project-workspace-registries"

const scope = createScope({ cwd: process.cwd() })
const store = createStoreProvider(scope, {
  backendFactory: mirkBackendFactory(scope),
})

export const agentThreadRepository = new AgentThreadRepository({
  threads: store.kv("project", "sigil-chat.agent-threads.v1"),
  preferences: store.kv("project", "sigil-chat.agent-thread-preferences.v1"),
  defaultPersonaId:
    process.env.SIGIL_DEFAULT_PERSONA_ID?.trim() || "sigil-chat-eve",
})

export const agentContextReceiptRepository =
  new MirkAgentContextReceiptRepository({
    kv: store.kv("project", "sigil-chat.context-receipts.v1"),
  })

export const agentThreadBindingService = createThreadBindingService({
  resolveModelPreset: (presetId) => resolveSelectableModelPreset(presetId),
  repository: agentThreadRepository,
  registries: getProjectWorkspaceRegistries(),
  loadNav: loadProjectWorkspaceNav,
  resolvePerspective: resolveScopePerspective,
})

export interface AgentThreadExecutionBindingRecord extends AgentThreadExecutionBinding {
  eveSessionId?: string
  threadId: string
  /**
   * The thread's LIVE mutable reasoning/fast-mode state (MDL.4), read fresh
   * on every call — unlike every other field on this record, which is a
   * snapshot of the immutable `executionBinding`. This is what lets
   * agent-session-binding.ts mint a proof that reflects a mid-conversation
   * reasoning change without touching session identity.
   */
  requestOptions?: AgentThreadRequestOptions
}

export function ownedAgentThreadHomeScope(
  principalId: string,
  threadId: string,
): string | undefined {
  return agentThreadRepository.get(principalId, threadId)?.executionBinding
    ?.homeScopeId
}

export function resolveAgentThreadExecutionBinding(
  principalId: string,
  threadId: string,
): AgentThreadExecutionBindingRecord {
  const thread = agentThreadBindingService.resolveExecution(
    principalId,
    threadId,
  )
  if (!thread.executionBinding) {
    throw new Error(`Agent thread ${threadId} is missing an execution binding.`)
  }
  return {
    threadId,
    ...thread.executionBinding,
    ...(thread.runtime.session.sessionId
      ? { eveSessionId: thread.runtime.session.sessionId }
      : {}),
    ...(thread.requestOptions ? { requestOptions: thread.requestOptions } : {}),
  }
}
