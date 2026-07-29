export const AGENT_SESSION_BINDING_HEADER = "x-sigil-session-binding";

export interface AgentSessionScopePerspective {
  focusScopeId: string;
  viaScopeIds: string[];
}

export type AgentSessionBindingParticipantState = "active" | "dormant";

export interface AgentSessionBindingHumanParticipant {
  kind: "human";
  participantId: string;
  principalId: string;
  role: "owner" | "member";
}

export interface AgentSessionBindingPersonaParticipant {
  kind: "persona-session";
  participantId: string;
  principalId: string;
  personaId: string;
  eveSessionId: string;
  applicationThreadId: string;
  role?: "participant" | "coordinator";
  state?: AgentSessionBindingParticipantState;
}

export type AgentSessionBindingParticipant =
  | AgentSessionBindingHumanParticipant
  | AgentSessionBindingPersonaParticipant;

export interface AgentSessionBindingChannel {
  channelId: string;
  ownerPrincipalId: string;
  participants: readonly AgentSessionBindingParticipant[];
}

/** Immutable application execution context carried into Eve at session bind. */
export interface AgentSessionExecutionBinding {
  applicationThreadId: string;
  personaId: string;
  channel?: AgentSessionBindingChannel;
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
