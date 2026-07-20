import { createScope } from "@gonk/scope";
import { createStoreProvider, mirkBackendFactory } from "@gonk/store";

import { AgentThreadRepository } from "@/lib/agent-threads-domain";

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
