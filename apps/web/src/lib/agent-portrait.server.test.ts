import { beforeEach, describe, expect, it, vi } from "vitest";

import { readAgentPortraitFromRequest } from "./agent-portrait.server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));

vi.mock("./auth/session", () => ({
  getSession: mocks.getSession,
  requireSession: (session: unknown) => {
    if (!session)
      throw Object.assign(new Error("Authentication required"), {
        status: 401,
      });
  },
}));

vi.mock("./agent-profile.server", () => ({
  personaRegistry: {
    exists: (id: string) => id === "agent-1",
    portraitFor: (id: string) =>
      id === "agent-1"
        ? { path: "/portraits/agent-1.png", mimeType: "image/png" }
        : undefined,
  },
}));

describe("readAgentPortraitFromRequest", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.readFile.mockReset();
    mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("serves portraits to authenticated non-owner members", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "member-1", role: "member" },
    });

    const response = await readAgentPortraitFromRequest(
      new Request("http://sigil.test/api/media/portrait?personaId=agent-1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(mocks.readFile).toHaveBeenCalledWith("/portraits/agent-1.png");
  });

  it("still rejects anonymous portrait reads", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await readAgentPortraitFromRequest(
      new Request("http://sigil.test/api/media/portrait?personaId=agent-1"),
    );

    expect(response.status).toBe(401);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
