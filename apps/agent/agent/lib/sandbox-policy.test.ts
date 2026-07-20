import { describe, expect, it, vi } from "vitest";

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

  it("reasserts deny-all networking whenever a session opens", async () => {
    const use = vi.fn().mockResolvedValue(undefined);

    await sandbox.onSession?.({
      ctx: {} as never,
      use,
    });

    expect(use).toHaveBeenCalledOnce();
    expect(use).toHaveBeenCalledWith({ networkPolicy: "deny-all" });
  });

  it.each([
    ["bash", bash],
    ["write_file", writeFile],
  ])("requires approval for %s on every call", async (_name, tool) => {
    const result = await tool.approval?.({
      approvedTools: new Set(),
      callId: "call-1",
      toolName: _name,
    } as never);

    expect(result).toBe("user-approval");
  });

  it("describes both tools as session-scoped VM operations", () => {
    expect(bash.description).toContain("session's persistent");
    expect(writeFile.description).toContain("session's persistent");
  });
});
