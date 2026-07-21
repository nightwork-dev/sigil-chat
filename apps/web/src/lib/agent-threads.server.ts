import { createScope } from "@gonk/scope";
import { createStoreProvider, mirkBackendFactory } from "@gonk/store";

import { AgentThreadRepository } from "@/lib/agent-threads-domain";
import type { AgentThreadExecutionBinding } from "@/lib/agent-threads-domain";

const scope = createScope({ cwd: process.cwd() });
const store = createStoreProvider(scope, {
  backendFactory: mirkBackendFactory(scope),
});

export const agentThreadRepository = new AgentThreadRepository({
  threads: store.kv("project", "sigil-chat.agent-threads.v1"),
  preferences: store.kv("project", "sigil-chat.agent-thread-preferences.v1"),
  defaultPersonaId:
    process.env.SIGIL_DEFAULT_PERSONA_ID?.trim() || "sigil-chat-eve",
});

export interface AgentThreadExecutionBindingRecord
  extends AgentThreadExecutionBinding {
  threadId: string;
}

export function resolveAgentThreadExecutionBinding(
  principalId: string,
  threadId: string,
): AgentThreadExecutionBindingRecord {
  const thread = agentThreadRepository.get(principalId, threadId);
  if (!thread) throw new Error(`Agent thread ${threadId} was not found.`);
  if (!thread.executionBinding) {
    throw new Error(`Agent thread ${threadId} is missing an execution binding.`);
  }
  return { threadId, ...thread.executionBinding };
}
