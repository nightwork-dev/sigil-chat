import { describe, expect, it } from "vitest";

import {
  blackboardStoreKey,
  resolveEffectiveBlackboardTier,
} from "./blackboard-scope";

describe("blackboardStoreKey", () => {
  it("keeps the session tier's bare-id key for backward compatibility", () => {
    expect(blackboardStoreKey({ tier: "session", id: "thread-1" })).toBe(
      "thread-1",
    );
  });

  it("prefixes workspace and project tiers so they never collide with a session id", () => {
    expect(blackboardStoreKey({ tier: "workspace", id: "ws-1" })).toBe(
      "workspace:ws-1",
    );
    expect(blackboardStoreKey({ tier: "project", id: "proj-1" })).toBe(
      "project:proj-1",
    );
  });

  it("rejects a session id shaped like a workspace/project key instead of silently colliding", () => {
    // Without this guard, {tier:"session", id:"workspace:foo"} and
    // {tier:"workspace", id:"foo"} would both resolve to store key
    // "workspace:foo" — a cross-container blackboard read.
    expect(() =>
      blackboardStoreKey({ tier: "session", id: "workspace:foo" }),
    ).toThrow('must not contain ":"');
    expect(() =>
      blackboardStoreKey({ tier: "session", id: "project:foo" }),
    ).toThrow('must not contain ":"');
  });
});

describe("resolveEffectiveBlackboardTier", () => {
  it("prefers session, then workspace, then project", () => {
    expect(
      resolveEffectiveBlackboardTier({
        session: { content: "session notes" },
        workspace: { content: "workspace notes" },
        project: { content: "project notes" },
      }),
    ).toBe("session");
    expect(
      resolveEffectiveBlackboardTier({
        session: { content: "" },
        workspace: { content: "workspace notes" },
        project: { content: "project notes" },
      }),
    ).toBe("workspace");
    expect(
      resolveEffectiveBlackboardTier({
        session: undefined,
        workspace: { content: "" },
        project: { content: "project notes" },
      }),
    ).toBe("project");
  });

  it("returns undefined when every tier is empty or absent", () => {
    expect(
      resolveEffectiveBlackboardTier({
        session: { content: "" },
        workspace: undefined,
        project: { content: "" },
      }),
    ).toBeUndefined();
    expect(resolveEffectiveBlackboardTier({})).toBeUndefined();
  });
});
