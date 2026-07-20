import { describe, expect, it } from "vitest";

import sandbox from "../sandbox";
import bash from "../tools/bash";
import writeFile from "../tools/write_file";

describe("agent sandbox policy", () => {
  it("pins the agent to the Microsandbox backend", () => {
    const backend =
      typeof sandbox.backend === "function"
        ? sandbox.backend()
        : sandbox.backend;

    expect(backend?.name).toBe("microsandbox");
  });

  it.each([
    ["bash", bash],
    ["write_file", writeFile],
  ])("requires approval for %s on every call", async (_name, tool) => {
    if (!("approval" in tool)) throw new Error(`${_name} is disabled`);
    const result = await tool.approval?.({
      approvedTools: new Set(),
      callId: "call-1",
      toolName: _name,
    } as never);

    expect(result).toBe("user-approval");
  });

  it("describes both tools as session-scoped VM operations", () => {
    if (!("description" in bash) || !("description" in writeFile)) {
      throw new Error("sandbox tools are disabled");
    }
    expect(bash.description).toContain("session's persistent");
    expect(writeFile.description).toContain("session's persistent");
  });
});
