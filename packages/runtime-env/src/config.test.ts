import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadSigilConfigFixture,
  normalizeSigilAgentModelConfig,
} from "./config.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Sigil authored configuration fixture", () => {
  it("loads typed YAML with Mirk provenance", async () => {
    const path = fixturePath(`
agent:
  model: gpt-5.6-terra
auth:
  registration: closed
branding:
  accent: "#b58b35"
  description: A test workspace.
  name: Test Sigil
  shareImageUrl: /share.png
  title: Test Sigil — conversations
imageEdit:
  preset: flux2klein4b
  quality: fast
`);

    const fixture = await loadSigilConfigFixture(path);

    expect(fixture.value).toMatchObject({
      agent: { model: "gpt-5.6-terra" },
      auth: { registration: "closed" },
      branding: { name: "Test Sigil" },
      imageEdit: { preset: "flux2klein4b", quality: "fast" },
    });
    expect(normalizeSigilAgentModelConfig(fixture.value.agent.model)).toEqual({
      provider: "codex",
      model: "gpt-5.6-terra",
      source: "bare-slug",
    });
    expect(fixture.provenance).toMatchObject({
      finalRef: "application:sigil-chat",
      layers: [
        expect.objectContaining({
          path: "application/sigil-chat.yaml",
          sourceId: "sigil-chat-repository",
        }),
      ],
    });
  });

  it("loads the structured model provider contract", async () => {
    const path = fixturePath(`
agent:
  model:
    provider: openai-compatible
    model: llama3.1:8b
    baseUrl: http://127.0.0.1:11434/v1
    apiKeyEnv: SIGIL_MODEL_OPENAI_COMPATIBLE_API_KEY
    contextWindowTokens: 131072
auth:
  registration: closed
branding:
  accent: "#b58b35"
  description: A test workspace.
  name: Test Sigil
  shareImageUrl: /share.png
  title: Test Sigil — conversations
imageEdit:
  preset: flux2klein4b
  quality: fast
`);

    const fixture = await loadSigilConfigFixture(path);

    expect(normalizeSigilAgentModelConfig(fixture.value.agent.model)).toEqual({
      provider: "openai-compatible",
      model: "llama3.1:8b",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKeyEnv: "SIGIL_MODEL_OPENAI_COMPATIBLE_API_KEY",
      contextWindowTokens: 131072,
      source: "object",
    });
  });

  it("fails before startup on malformed authored configuration", async () => {
    const path = fixturePath(`
agent:
  model: bad model
auth:
  registration: maybe
branding: {}
imageEdit: {}
`);

    await expect(loadSigilConfigFixture(path)).rejects.toThrow(
      /must be a non-empty slug without whitespace/,
    );
  });

  it("fails before startup when provider-specific model fields are invalid", async () => {
    const path = fixturePath(`
agent:
  model:
    provider: openai-compatible
    model: local model
    baseUrl: not-a-url
    apiKeyEnv: not-an-env-name
    contextWindowTokens: 0
auth:
  registration: closed
branding:
  accent: "#b58b35"
  description: A test workspace.
  name: Test Sigil
  shareImageUrl: /share.png
  title: Test Sigil — conversations
imageEdit:
  preset: flux2klein4b
  quality: fast
`);

    await expect(loadSigilConfigFixture(path)).rejects.toThrow(
      /must be a non-empty model id without whitespace/,
    );
  });
});

function fixturePath(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "sigil-config-fixture-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "fixtures", "application", "sigil-chat.yaml");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents.trimStart(), "utf8");
  return path;
}
