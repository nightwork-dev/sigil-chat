import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EVE_ORIGIN,
  joinRuntimeUrl,
  portlessSiblingUrl,
  readPublicWebEnvironment,
  readRuntimeTopology,
  RuntimeEnvironmentError,
} from "./topology.js";
import {
  parsePort,
  readEmbeddingEnvironment,
  readDataEnvironment,
  readIdentityEnvironment,
  readOptionalSecretFromFile,
  readStorageEnvironment,
} from "./server.js";

const temporaryDirectories: string[] = [];

describe("runtime topology", () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("provides the Portless development defaults", () => {
    expect(readRuntimeTopology({})).toEqual({
      eveOrigin: DEFAULT_EVE_ORIGIN,
    });
  });

  it("keeps sibling services inside the current Portless worktree namespace", () => {
    expect(
      readRuntimeTopology({
        PORTLESS_URL: "http://feature-auth.sigil-chat.localhost:1355",
      }),
    ).toEqual({
      eveOrigin: "http://feature-auth.sigil-chat-agent.localhost:1355",
    });
    expect(
      readRuntimeTopology({
        PORTLESS_URL: "http://feature-auth.sigil-chat-agent.localhost:1355",
      }).eveOrigin,
    ).toBe("http://feature-auth.sigil-chat-agent.localhost:1355");
    expect(portlessSiblingUrl("not a URL", "sigil-chat-agent")).toBeUndefined();
  });

  it("keeps explicit topology overrides authoritative under Portless", () => {
    expect(
      readRuntimeTopology({
        PORTLESS_URL: "http://feature.sigil-chat.localhost:1355",
        EVE_ORIGIN: "https://eve.example.test",
      }),
    ).toEqual({
      eveOrigin: "https://eve.example.test",
    });
  });

  it("normalizes URL trailing slashes and joins root-relative paths", () => {
    const topology = readRuntimeTopology({
      EVE_ORIGIN: " https://agent.example.test/// ",
    });
    expect(topology).toEqual({
      eveOrigin: "https://agent.example.test",
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
      SIGIL_AGENT_BINDING_SECRET: " token ",
      VITE_API_BASE_URL: "https://api.example.test",
    };
    expect(readRuntimeTopology(env)).not.toHaveProperty("apiKey");
    expect(readPublicWebEnvironment(env)).not.toHaveProperty("apiKey");
    expect(readOptionalSecretFromFile(env, "SIGIL_AGENT_BINDING_SECRET")).toBe(
      "token",
    );
  });

  it("prefers inline secret value over _FILE", () => {
    expect(
      readOptionalSecretFromFile(
        {
          SIGIL_AGENT_BINDING_SECRET: "  inlined  ",
          SIGIL_AGENT_BINDING_SECRET_FILE: "ignored",
        },
        "SIGIL_AGENT_BINDING_SECRET",
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
          SIGIL_AGENT_BINDING_SECRET_FILE: secretFile,
        },
        "SIGIL_AGENT_BINDING_SECRET",
      ),
    ).toBe("file-backed-secret");
  });

  it("derives disposable stores from one data root", () => {
    expect(
      readDataEnvironment(
        { SIGIL_DATA_DIR: " /srv/sigil " },
        "/workspace/apps/web",
      ),
    ).toEqual({
      artifactDir: "/srv/sigil/artifacts",
      blackboardDir: "/srv/sigil/blackboard",
      containerRegistryRoot: "/srv/sigil/containers",
      graphPath: "/srv/sigil/graph",
      identityDir: "/srv/sigil/identity",
      memoryDir: "/srv/sigil/identity/memory",
      personaDir: "/srv/sigil/identity/persona",
      reviewPath: "/srv/sigil/review",
      rootDir: "/srv/sigil",
      skillsDir: "/srv/sigil/skills",
    });
  });

  it("keeps specialist storage overrides available for isolated deployments", () => {
    expect(
      readStorageEnvironment(
        {
          SIGIL_DATA_DIR: "/srv/sigil",
          SIGIL_CHAT_GRAPH_PATH: " ./data/graph.json ",
          SIGIL_CHAT_REVIEW_PATH: " data/review.json ",
        },
        "/workspace/apps/agent",
      ),
    ).toEqual({
      graphPath: "/workspace/apps/agent/data/graph.json",
      reviewPath: "/workspace/apps/agent/data/review.json",
    });
  });

  it("resolves one shared identity store for sibling app packages", () => {
    const project = temporaryDirectory();
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({ name: "sigil-chat" }),
    );
    const web = join(project, "apps", "web");

    expect(readIdentityEnvironment({}, web)).toEqual({
      personaDir: join(project, ".data", "identity", "persona"),
      memoryDir: join(project, ".data", "identity", "memory"),
    });
    expect(
      readIdentityEnvironment(
        {
          SIGIL_DATA_DIR: "/srv/sigil",
          SIGIL_PERSONA_DIR: "/var/lib/example/personas",
          SIGIL_MEMORY_DIR: "./private-memory",
        },
        "/workspace/apps/agent",
      ),
    ).toEqual({
      personaDir: "/var/lib/example/personas",
      memoryDir: "/workspace/apps/agent/private-memory",
    });
  });

  it("refuses to guess a data root outside a Sigil Chat project", () => {
    const directory = temporaryDirectory();

    expect(() => readDataEnvironment({}, directory)).toThrow(
      /Could not find the Sigil Chat project root/,
    );
  });

  it("enables the embedding provider when its configuration is complete", () => {
    expect(
      readEmbeddingEnvironment({
        SIGIL_EMBEDDING_BASE_URL: " http://localhost:1234/v1/ ",
        SIGIL_EMBEDDING_MODEL: " nomic-embed-text-v1.5 ",
        SIGIL_EMBEDDING_DIM: "768",
        SIGIL_EMBEDDING_API_KEY: " dev-key ",
      }),
    ).toEqual({
      enabled: true,
      baseURL: "http://localhost:1234/v1",
      model: "nomic-embed-text-v1.5",
      dim: 768,
      apiKey: "dev-key",
    });
  });

  it("treats a partial embedding configuration as disabled", () => {
    expect(
      readEmbeddingEnvironment({
        SIGIL_EMBEDDING_BASE_URL: "http://localhost:1234/v1",
      }),
    ).toEqual({ enabled: false });
    expect(
      readEmbeddingEnvironment({
        SIGIL_EMBEDDING_MODEL: "nomic-embed-text-v1.5",
      }),
    ).toEqual({ enabled: false });
  });

  it("rejects invalid embedding dimensions", () => {
    for (const dim of ["0", "-1", "768.5", "not-an-integer"]) {
      expectRuntimeError(
        () =>
          readEmbeddingEnvironment({
            SIGIL_EMBEDDING_BASE_URL: "http://localhost:1234/v1",
            SIGIL_EMBEDDING_MODEL: "nomic-embed-text-v1.5",
            SIGIL_EMBEDDING_DIM: dim,
          }),
        "INVALID_EMBEDDING_DIM",
        "SIGIL_EMBEDDING_DIM",
      );
    }
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

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "runtime-env-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
