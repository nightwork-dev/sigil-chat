import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadSigilConfigFixture,
  normalizeSigilAgentModelConfig,
  normalizeSigilAgentModelPresets,
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

describe("Sigil model presets", () => {
  it("yields a single deployment-default entry when no presets are authored", async () => {
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

    expect(normalizeSigilAgentModelPresets(fixture.value.agent)).toEqual([
      {
        id: "deployment-default",
        label: "gpt-5.6-terra (Codex subscription)",
        provider: "codex",
        model: "gpt-5.6-terra",
        source: "bare-slug",
        isDeploymentDefault: true,
      },
    ]);
  });

  it("adds a hosted vendor with fixture data alone", async () => {
    const path = fixturePath(`
agent:
  model: gpt-5.6-terra
  presets:
    - id: deepseek
      label: DeepSeek
      provider: openai-compatible
      model: deepseek-chat
      baseUrl: https://api.deepseek.com/v1
      apiKeyEnv: SIGIL_MODEL_DEEPSEEK_API_KEY
      contextWindowTokens: 65536
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
    const presets = normalizeSigilAgentModelPresets(fixture.value.agent);

    expect(presets).toHaveLength(2);
    expect(presets[0]?.isDeploymentDefault).toBe(true);
    expect(presets[1]).toEqual({
      id: "deepseek",
      label: "DeepSeek",
      provider: "openai-compatible",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      contextWindowTokens: 65536,
      source: "object",
      isDeploymentDefault: false,
    });
  });

  it("fails before startup when two presets claim the same id", async () => {
    const path = fixturePath(`
agent:
  model: gpt-5.6-terra
  presets:
    - id: local
      label: One
      provider: openai-compatible
      model: a
      baseUrl: http://127.0.0.1:1234/v1
    - id: local
      label: Two
      provider: openai-compatible
      model: b
      baseUrl: http://127.0.0.1:1235/v1
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
      /must be unique across presets/,
    );
  });

  it("fails before startup when a preset claims the reserved default id", async () => {
    const path = fixturePath(`
agent:
  model: gpt-5.6-terra
  presets:
    - id: deployment-default
      label: Impostor
      provider: openai-compatible
      model: a
      baseUrl: http://127.0.0.1:1234/v1
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
      /reserved for agent\.model/,
    );
  });

  it("fails before startup when a preset omits its label or a required base URL", async () => {
    const path = fixturePath(`
agent:
  model: gpt-5.6-terra
  presets:
    - id: local
      provider: openai-compatible
      model: a
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
      /must be a non-empty string|is required when provider is/,
    );
  });

  it("fails before startup when presets is not a list", async () => {
    const path = fixturePath(`
agent:
  model: gpt-5.6-terra
  presets:
    deepseek: yes
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
      /must be a list of model presets/,
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
