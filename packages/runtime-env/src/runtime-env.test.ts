import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EVE_ORIGIN,
  DEFAULT_GONK_MCP_URL,
  joinRuntimeUrl,
  readPublicWebEnvironment,
  readRuntimeTopology,
  RuntimeEnvironmentError,
} from "./topology.js";
import {
  DEFAULT_CODEX_MODEL,
  parsePort,
  readAgentEnvironment,
  readGonkClientEnvironment,
  readOptionalSecretFromFile,
  readGonkServerEnvironment,
  readStorageEnvironment,
} from "./server.js";

describe("runtime topology", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("provides the Portless development defaults", () => {
    expect(readRuntimeTopology({})).toEqual({
      eveOrigin: DEFAULT_EVE_ORIGIN,
      gonkMcpUrl: DEFAULT_GONK_MCP_URL,
    });
    expect(readGonkServerEnvironment({})).toMatchObject({ port: 8808 });
  });

  it("supports a plain numeric server port override", () => {
    expect(readGonkServerEnvironment({ PORT: "9900" }).port).toBe(9900);
  });

  it("normalizes URL trailing slashes and joins root-relative paths", () => {
    const topology = readRuntimeTopology({
      EVE_ORIGIN: " https://agent.example.test/// ",
      GONK_MCP_URL: "https://gonk.example.test/mcp/",
    });
    expect(topology).toEqual({
      eveOrigin: "https://agent.example.test",
      gonkMcpUrl: "https://gonk.example.test/mcp",
    });
    expect(joinRuntimeUrl(topology.eveOrigin, "/eve/v1/info")).toBe(
      "https://agent.example.test/eve/v1/info",
    );
  });

  it("returns stable actionable errors for invalid values", () => {
    expectRuntimeError(
      () => readRuntimeTopology({ EVE_ORIGIN: "mailto:agent@example.test" }),
      "INVALID_HTTP_URL",
      "EVE_ORIGIN",
    );
    expectRuntimeError(
      () => parsePort("12x", 8808, "PORT"),
      "INVALID_PORT",
      "PORT",
    );
    expectRuntimeError(
      () => readPublicWebEnvironment({ PAGES_BASE: "repo" }),
      "INVALID_PATH_BASE",
      "PAGES_BASE",
    );
    expectRuntimeError(
      () => readAgentEnvironment({ CODEX_MODEL: "bad model" }),
      "INVALID_MODEL",
      "CODEX_MODEL",
    );
  });

  it("normalizes static path bases and optional public API URLs", () => {
    expect(
      readPublicWebEnvironment({
        PAGES_BASE: "/sigil-chat",
        VITE_API_BASE_URL: "https://api.example.test/v1/",
      }),
    ).toEqual({
      pagesBase: "/sigil-chat/",
      apiBaseUrl: "https://api.example.test/v1",
    });
    expect(readPublicWebEnvironment({})).toEqual({
      pagesBase: "/",
      apiBaseUrl: undefined,
    });
  });

  it("keeps secrets out of public topology projections", () => {
    const env = {
      GONK_MCP_KEY: " token ",
      VITE_API_BASE_URL: "https://api.example.test",
    };
    expect(readRuntimeTopology(env)).not.toHaveProperty("apiKey");
    expect(readPublicWebEnvironment(env)).not.toHaveProperty("apiKey");
    expect(readGonkClientEnvironment(env)).toMatchObject({ apiKey: "token" });
  });

  it("uses the established model default and accepts an override", () => {
    expect(readAgentEnvironment({})).toEqual({ model: DEFAULT_CODEX_MODEL });
    expect(readAgentEnvironment({ CODEX_MODEL: "gpt-5.5" })).toEqual({
      model: "gpt-5.5",
    });
  });

  it("prefers inline secret value over _FILE", () => {
    expect(
      readOptionalSecretFromFile(
        {
          GONK_MCP_KEY: "  inlined  ",
          GONK_MCP_KEY_FILE: "ignored",
        },
        "GONK_MCP_KEY",
      ),
    ).toBe("inlined");
  });

  it("reads secret value from *_FILE", () => {
    const directory = mkdtempSync(join(tmpdir(), "runtime-env-test-"));
    temporaryDirectories.push(directory);
    const secretFile = join(directory, "secret");
    writeFileSync(secretFile, "file-backed-secret\n", { mode: 0o600 });

    expect(
      readOptionalSecretFromFile(
        {
          GONK_MCP_KEY_FILE: secretFile,
        },
        "GONK_MCP_KEY",
      ),
    ).toBe("file-backed-secret");
  });

  it("projects optional storage paths without inventing defaults", () => {
    expect(readStorageEnvironment({})).toEqual({
      graphPath: undefined,
      reviewPath: undefined,
    });
    expect(
      readStorageEnvironment({
        SIGIL_CHAT_GRAPH_PATH: " ./data/graph.json ",
        SIGIL_CHAT_REVIEW_PATH: " data/review.json ",
      }),
    ).toEqual({
      graphPath: "./data/graph.json",
      reviewPath: "data/review.json",
    });
  });
});

function expectRuntimeError(
  operation: () => unknown,
  code: RuntimeEnvironmentError["code"],
  variable: string,
): void {
  try {
    operation();
    throw new Error("Expected operation to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeEnvironmentError);
    expect(error).toMatchObject({
      name: "RuntimeEnvironmentError",
      code,
      variable,
      detail: expect.any(String),
    });
  }
}
