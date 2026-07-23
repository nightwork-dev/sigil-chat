import { describe, expect, it } from "vitest";

import type { ToolContext } from "@gonk/tool-registry";

import { requireResourceScope } from "../src/files.js";

// The turn's host scope (x-sigil-scope, set by the app) must be authoritative
// over any model-supplied scope. Regression guard for the Evidence Room bug
// where a model-guessed `session:<doc-key>` clobbered the correct
// `project:evidence-room` corpus, so evidence-ask/read-file searched the wrong
// scope and always came back empty.
function hostCtx(
  resourceScope?: string,
  agentReach?: "principal" | "scope",
): ToolContext {
  return {
    host: {
      ...(resourceScope ? { resourceScope } : {}),
      ...(agentReach ? { agentReach } : {}),
    },
  } as unknown as ToolContext;
}

describe("requireResourceScope", () => {
  it("prefers the host turn scope over a model-supplied scope", () => {
    const scope = requireResourceScope(
      { tier: "session", id: "uploads/deadbeef.md" },
      hostCtx("project:evidence-room"),
    );
    expect(scope).toEqual({ tier: "project", id: "evidence-room" });
  });

  it("falls back to the requested scope only when the host set none", () => {
    const scope = requireResourceScope(
      { tier: "session", id: "thread-123" },
      hostCtx(),
    );
    expect(scope).toEqual({ tier: "session", id: "thread-123" });
  });

  it("accepts workspace resource scopes", () => {
    expect(
      requireResourceScope(undefined, hostCtx("workspace:feature-1")),
    ).toEqual({
      tier: "workspace",
      id: "feature-1",
    });
  });

  it("lets a personal agent select another exact scope for live re-authorization", () => {
    expect(
      requireResourceScope(
        { tier: "workspace", id: "cross-project" },
        hostCtx("project:personal", "principal"),
      ),
    ).toEqual({ tier: "workspace", id: "cross-project" });
  });

  it("keeps a scope-homed agent inside the host scope", () => {
    expect(
      requireResourceScope(
        { tier: "workspace", id: "cross-project" },
        hostCtx("workspace:native", "scope"),
      ),
    ).toEqual({ tier: "workspace", id: "native" });
  });

  it("throws when neither host nor request supplies a scope", () => {
    expect(() => requireResourceScope(undefined, hostCtx())).toThrow();
  });
});
