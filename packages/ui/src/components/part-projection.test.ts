// The projection registry behind <MessageParts>: every part is `inline` until
// a surface opts in, tool-name overrides beat the generic toolCall mode, and
// MCP-prefixed names resolve to their bare registration. Locking these in node
// (per the repo's extract-the-math convention) is what keeps the no-provider
// path provably identical to the old hardcoded <AgentPart> switch.

import { describe, expect, it } from "vitest";

import type {
  AgentAuthorizationPart,
  AgentFilePart,
  AgentReasoningPart,
  AgentTextPart,
  AgentToolCallPart,
} from "@zigil/agent-surface";

import {
  DEFAULT_PROJECTION_MODE,
  resolveProjectionMode,
  type PartProjectionConfig,
} from "../components/part-projection";

const textPart: AgentTextPart = { type: "text", text: "hi" };
const reasoningPart: AgentReasoningPart = {
  type: "reasoning",
  text: "thinking",
};
const filePart: AgentFilePart = { type: "file", mediaType: "image/png" };
const toolCall = (name: string): AgentToolCallPart => ({
  type: "tool-call",
  id: "1",
  name,
  state: "output-available",
});
const authPart: AgentAuthorizationPart = {
  type: "authorization",
  id: "2",
  state: "completed",
  displayName: "Gonk",
  description: "",
};

describe("resolveProjectionMode — default is inline (additive by construction)", () => {
  it("returns inline for every part type with an empty config", () => {
    const empty: PartProjectionConfig = {};
    expect(resolveProjectionMode(empty, textPart)).toBe("inline");
    expect(resolveProjectionMode(empty, reasoningPart)).toBe("inline");
    expect(resolveProjectionMode(empty, filePart)).toBe("inline");
    expect(resolveProjectionMode(empty, toolCall("any-tool"))).toBe("inline");
    expect(resolveProjectionMode(empty, authPart)).toBe("inline");
  });

  it("DEFAULT_PROJECTION_MODE is inline (the contract the no-provider path rests on)", () => {
    expect(DEFAULT_PROJECTION_MODE).toBe("inline");
  });
});

describe("resolveProjectionMode — part-type overrides", () => {
  it("honors a per-type override", () => {
    const config: PartProjectionConfig = { reasoning: "ambient" };
    expect(resolveProjectionMode(config, reasoningPart)).toBe("ambient");
    // other types stay inline
    expect(resolveProjectionMode(config, textPart)).toBe("inline");
  });
});

describe("resolveProjectionMode — tool-call resolution (Q9: name carries default)", () => {
  it("uses the generic toolCall mode when no name match", () => {
    const config: PartProjectionConfig = { toolCall: "overlay" };
    expect(resolveProjectionMode(config, toolCall("unregistered"))).toBe(
      "overlay",
    );
  });

  it("a name match wins over the generic toolCall mode", () => {
    const config: PartProjectionConfig = {
      toolCall: "overlay",
      toolCallByName: { "sigil-annotate": "inline" },
    };
    expect(
      resolveProjectionMode(config, toolCall("sigil-annotate")),
    ).toBe("inline");
    expect(resolveProjectionMode(config, toolCall("other"))).toBe("overlay");
  });

  it("strips an MCP server prefix (gonk__sigil-annotate → sigil-annotate)", () => {
    const config: PartProjectionConfig = {
      toolCallByName: { "sigil-annotate": "overlay" },
    };
    expect(
      resolveProjectionMode(config, toolCall("gonk__sigil-annotate")),
    ).toBe("overlay");
  });

  it("a full-name match wins over the bare-name match", () => {
    const config: PartProjectionConfig = {
      toolCallByName: {
        "sigil-annotate": "overlay",
        "gonk__sigil-annotate": "inline",
      },
    };
    expect(
      resolveProjectionMode(config, toolCall("gonk__sigil-annotate")),
    ).toBe("inline");
  });

  it("falls back to inline when nothing is registered for the tool", () => {
    const config: PartProjectionConfig = {
      toolCallByName: { "sigil-annotate": "overlay" },
    };
    expect(resolveProjectionMode(config, toolCall("sigil-pin"))).toBe("inline");
  });
});
