import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadSigilConfigFixture,
  normalizeSigilAgentModelConfig,
  normalizeSigilAgentModelPresets,
  normalizeSigilAgentProviders,
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

describe("Sigil model providers", () => {
  const REST = `auth:
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
`;

  it("yields a single deployment-default provider when none are authored", async () => {
    const fixture = await loadSigilConfigFixture(
      fixturePath(`agent:\n  model: gpt-5.6-terra\n${REST}`),
    );

    expect(normalizeSigilAgentProviders(fixture.value.agent)).toEqual([
      {
        id: "deployment",
        label: "Codex subscription",
        kind: "codex",
        enabled: true,
        models: [
          {
            provider: "codex",
            model: "gpt-5.6-terra",
            source: "bare-slug",
            id: "deployment-default",
            label: "gpt-5.6-terra",
            providerId: "deployment",
            providerLabel: "Codex subscription",
            capability: "chat",
            enabled: true,
            isDeploymentDefault: true,
            fastMode: false,
          },
        ],
      },
    ]);
  });

  it("declares reasoning levels and fast mode per model (MDL.4)", async () => {
    const fixture = await loadSigilConfigFixture(
      fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: codex
      label: Codex subscription
      kind: codex
      models:
        - id: luna
          model: gpt-5.6-luna
          reasoning:
            levels: [off, low, medium, high, xhigh, max]
            default: medium
          fastMode: true
        - id: sol
          model: gpt-5.6-sol
${REST}`),
    );

    const presets = normalizeSigilAgentModelPresets(fixture.value.agent);
    const luna = presets.find((preset) => preset.id === "codex/luna");
    const sol = presets.find((preset) => preset.id === "codex/sol");
    const deploymentDefault = presets.find(
      (preset) => preset.id === "deployment-default",
    );

    expect(luna?.reasoning).toEqual({
      levels: ["off", "low", "medium", "high", "xhigh", "max"],
      default: "medium",
    });
    expect(luna?.fastMode).toBe(true);

    // No declaration → no control (AC2/AC3/AC5): absent, not a guessed default.
    expect(sol?.reasoning).toBeUndefined();
    expect(sol?.fastMode).toBe(false);
    expect(deploymentDefault?.reasoning).toBeUndefined();
    expect(deploymentDefault?.fastMode).toBe(false);
  });

  it("fails before startup on a malformed reasoning declaration", async () => {
    await expect(
      loadSigilConfigFixture(
        fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: codex
      label: Codex subscription
      kind: codex
      models:
        - id: luna
          model: gpt-5.6-luna
          reasoning:
            levels: []
            default: medium
${REST}`),
      ),
    ).rejects.toThrow();

    await expect(
      loadSigilConfigFixture(
        fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: codex
      label: Codex subscription
      kind: codex
      models:
        - id: luna
          model: gpt-5.6-luna
          reasoning:
            levels: [low, medium, high]
            default: extreme
${REST}`),
      ),
    ).rejects.toThrow();
  });

  it("adds a hosted vendor with fixture data alone, models namespaced by provider", async () => {
    const fixture = await loadSigilConfigFixture(
      fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: deepseek
      label: DeepSeek
      kind: openai-compatible
      baseUrl: https://api.deepseek.com/v1
      apiKeyEnv: SIGIL_MODEL_DEEPSEEK_API_KEY
      contextWindowTokens: 65536
      models:
        - id: chat
          model: deepseek-chat
        - id: reasoner
          model: deepseek-reasoner
          contextWindowTokens: 131072
${REST}`),
    );

    const presets = normalizeSigilAgentModelPresets(fixture.value.agent);
    expect(presets.map((preset) => preset.id)).toEqual([
      "deployment-default",
      "deepseek/chat",
      "deepseek/reasoner",
    ]);
    // Provider-level facts fan out to each model; a model may override.
    expect(presets[1]).toMatchObject({
      provider: "openai-compatible",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      contextWindowTokens: 65536,
      providerId: "deepseek",
      providerLabel: "DeepSeek",
      capability: "chat",
      enabled: true,
    });
    expect(presets[2]?.contextWindowTokens).toBe(131072);
  });

  it("resolves the shaped-but-unenforced enabled and capability slots", async () => {
    const fixture = await loadSigilConfigFixture(
      fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: off
      label: Disabled vendor
      kind: openai-compatible
      baseUrl: https://api.vendor.com/v1
      enabled: false
      models:
        - id: chat
          model: vendor-chat
          enabled: true
    - id: embed
      label: Embeddings
      kind: openai-compatible
      baseUrl: https://api.embed.com/v1
      models:
        - id: small
          model: embed-small
          capability: embedding
          enabled: false
${REST}`),
    );

    const presets = normalizeSigilAgentModelPresets(fixture.value.agent);
    // A model inside a disabled provider is disabled regardless of its flag.
    expect(presets[1]).toMatchObject({ id: "off/chat", enabled: false });
    expect(presets[2]).toMatchObject({
      id: "embed/small",
      capability: "embedding",
      enabled: false,
    });
  });

  it("fans provider-level pricing out to models, overridden per model", async () => {
    const fixture = await loadSigilConfigFixture(
      fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: codex
      label: Codex subscription
      kind: codex
      pricing:
        inputPerMillionTokens: 1
        outputPerMillionTokens: 6
      models:
        - id: luna
          model: gpt-5.6-luna
        - id: sol
          model: gpt-5.6-sol
          pricing:
            inputPerMillionTokens: 5
            outputPerMillionTokens: 30
${REST}`),
    );

    const presets = normalizeSigilAgentModelPresets(fixture.value.agent);
    expect(presets.find((preset) => preset.id === "codex/luna")?.pricing).toEqual(
      { inputPerMillionTokens: 1, outputPerMillionTokens: 6 },
    );
    expect(presets.find((preset) => preset.id === "codex/sol")?.pricing).toEqual(
      { inputPerMillionTokens: 5, outputPerMillionTokens: 30 },
    );
    // The bare-slug deployment default carries no pricing to inherit.
    expect(
      presets.find((preset) => preset.id === "deployment-default")?.pricing,
    ).toBeUndefined();
  });

  it("fails before startup when a model's pricing rate is negative", async () => {
    await expect(
      loadSigilConfigFixture(
        fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: codex
      label: Codex subscription
      kind: codex
      models:
        - id: luna
          model: gpt-5.6-luna
          pricing:
            inputPerMillionTokens: -1
${REST}`),
      ),
    ).rejects.toThrow(/non-negative number/);
  });

  it("fails before startup when two providers claim the same id", async () => {
    await expect(
      loadSigilConfigFixture(
        fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: local
      label: One
      kind: openai-compatible
      baseUrl: http://127.0.0.1:1234/v1
      models:
        - id: a
          model: a
    - id: local
      label: Two
      kind: openai-compatible
      baseUrl: http://127.0.0.1:1235/v1
      models:
        - id: b
          model: b
${REST}`),
      ),
    ).rejects.toThrow(/must be unique across providers/);
  });

  it("fails before startup when two models in one provider claim the same id", async () => {
    await expect(
      loadSigilConfigFixture(
        fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: local
      label: Local
      kind: openai-compatible
      baseUrl: http://127.0.0.1:1234/v1
      models:
        - id: a
          model: one
        - id: a
          model: two
${REST}`),
      ),
    ).rejects.toThrow(/must be unique within its provider/);
  });

  it("fails before startup when a provider claims the reserved id", async () => {
    await expect(
      loadSigilConfigFixture(
        fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: deployment
      label: Impostor
      kind: codex
      models:
        - id: a
          model: a
${REST}`),
      ),
    ).rejects.toThrow(/reserved for agent\.model/);
  });

  it("fails before startup when a provider omits models or a required base URL", async () => {
    await expect(
      loadSigilConfigFixture(
        fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    - id: local
      label: Local
      kind: openai-compatible
      models: []
${REST}`),
      ),
    ).rejects.toThrow(/must be a non-empty list of models|is required when kind is/);
  });

  it("fails before startup when providers is not a list", async () => {
    await expect(
      loadSigilConfigFixture(
        fixturePath(`agent:
  model: gpt-5.6-terra
  providers:
    deepseek: yes
${REST}`),
      ),
    ).rejects.toThrow(/must be a list of providers/);
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
