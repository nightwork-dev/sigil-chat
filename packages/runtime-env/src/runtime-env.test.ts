import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVE_ORIGIN,
  DEFAULT_GONK_MCP_URL,
  joinRuntimeUrl,
  readRuntimeTopology,
} from "./topology.js";
import {
  parsePort,
  readGonkClientEnvironment,
  readGonkServerEnvironment,
} from "./server.js";

describe("runtime topology", () => {
  it("provides one set of defaults for every host", () => {
    expect(readRuntimeTopology({})).toEqual({
      eveOrigin: DEFAULT_EVE_ORIGIN,
      gonkMcpUrl: DEFAULT_GONK_MCP_URL,
    });
  });

  it("normalizes endpoints without exposing server secrets", () => {
    const topology = readRuntimeTopology({
      EVE_ORIGIN: " https://agent.example.test/ ",
      GONK_MCP_URL: "https://gonk.example.test/mcp/",
      GONK_MCP_KEY: "do-not-project",
    });
    expect(topology).toEqual({
      eveOrigin: "https://agent.example.test",
      gonkMcpUrl: "https://gonk.example.test/mcp",
    });
    expect(topology).not.toHaveProperty("apiKey");
  });

  it("rejects invalid protocols and ports", () => {
    expect(() =>
      readRuntimeTopology({ EVE_ORIGIN: "file:///tmp/eve" }),
    ).toThrow("EVE_ORIGIN");
    expect(() => parsePort("0", 8808, "PORT")).toThrow("PORT");
    expect(() => parsePort("12x", 8808, "PORT")).toThrow("PORT");
  });

  it("keeps secrets in the server-only projection", () => {
    expect(
      readGonkServerEnvironment({ GONK_MCP_KEY: " token ", PORT: "9900" }),
    ).toMatchObject({ apiKey: "token", port: 9900 });
  });

  it("does not make the agent client depend on the server port", () => {
    expect(
      readGonkClientEnvironment({ GONK_MCP_KEY: "token", PORT: "invalid" }),
    ).toMatchObject({ apiKey: "token", gonkMcpUrl: DEFAULT_GONK_MCP_URL });
  });

  it("joins paths without losing an origin subpath", () => {
    expect(joinRuntimeUrl("https://example.test/base", "/eve/v1/info")).toBe(
      "https://example.test/eve/v1/info",
    );
  });
});
