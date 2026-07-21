import { describe, expect, it } from "vitest";

import {
  issueAgentSessionBinding,
  readAgentSessionBinding,
} from "./session-binding.server";

const secret = "test-session-binding-secret";
const binding = {
  applicationThreadId: "thread-a",
  eveSessionId: "eve-session-a",
  personaId: "agent-a",
  homeScopeId: "workspace-a",
  initialPerspective: {
    focusScopeId: "workspace-a",
    viaScopeIds: ["project-a"],
  },
  additionalContextScopeIds: ["workspace-b"],
  subject: "user-a",
  expiresAt: 200,
};

describe("agent session binding attestation", () => {
  it("round-trips the complete immutable execution binding", () => {
    const proof = issueAgentSessionBinding(binding, secret);
    expect(readAgentSessionBinding(proof, 100, secret)).toEqual({
      ...binding,
      audience: "sigil-agent-session-binding",
      version: 1,
    });
  });

  it("rejects tampering, the wrong secret, and expiry", () => {
    const proof = issueAgentSessionBinding(binding, secret);
    expect(readAgentSessionBinding(`${proof}x`, 100, secret)).toBeUndefined();
    expect(readAgentSessionBinding(proof, 100, "wrong-secret")).toBeUndefined();
    expect(readAgentSessionBinding(proof, 200, secret)).toBeUndefined();
  });
});
