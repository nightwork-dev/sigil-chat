export const AGENT_SESSION_BINDING_HEADER = "x-sigil-session-binding";

export interface AgentSessionScopePerspective {
  focusScopeId: string;
  viaScopeIds: string[];
}

/** Immutable application execution context carried into Eve at session bind. */
export interface AgentSessionExecutionBinding {
  applicationThreadId: string;
  personaId: string;
  homeScopeId: string;
  initialPerspective: AgentSessionScopePerspective;
  additionalContextScopeIds: string[];
}

export interface AgentSessionBindingPayload extends AgentSessionExecutionBinding {
  audience: "sigil-agent-session-binding";
  /** Present once the application thread has persisted its Eve session id. */
  eveSessionId?: string;
  expiresAt: number;
  subject: string;
  version: 1;
}
