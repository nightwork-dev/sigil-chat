import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  createFixtureLoader,
  createFixtureRegistry,
  defineFixtureType,
  type LoadedFixture,
  type StandardSchemaV1Issue,
} from "@mirk/fixtures";
import { createMemoryFixtureSource } from "@mirk/fixtures/memory";
import { parse as parseYaml } from "yaml";

import { resolveSigilProjectRoot } from "@workspace/runtime-env/project-root";

export type SigilAgentModelProvider =
  | "codex"
  | "openai-compatible"
  | "openrouter"
  | "anthropic";

export interface SigilAgentModelObjectConfig {
  provider: SigilAgentModelProvider;
  model: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  contextWindowTokens?: number;
}

export type SigilAgentModelConfig = string | SigilAgentModelObjectConfig;

/**
 * A named, fixture-authored model entry.
 *
 * This is the seam that keeps *vendors* out of TypeScript. `provider` names a
 * transport kind the resolver already knows how to build (`codex`,
 * `openai-compatible`, `openrouter`, `anthropic`); everything that
 * distinguishes DeepSeek from Moonshot from a local LM Studio server — base
 * URL, credential variable name, default model id, context window — is data in
 * this record. Adding a hosted OpenAI-compatible vendor is a fixture edit plus
 * a credential, never a new enum member or a code branch.
 */
export interface SigilAgentModelPresetConfig
  extends SigilAgentModelObjectConfig {
  /** Stable slug used by selection UI and per-session bindings. */
  id: string;
  /** Human-facing name shown in the endpoint list. */
  label: string;
}

export interface NormalizedSigilAgentModelConfig {
  provider: SigilAgentModelProvider;
  model: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  contextWindowTokens?: number;
  source: "bare-slug" | "object";
}

export interface NormalizedSigilAgentModelPreset
  extends NormalizedSigilAgentModelConfig {
  id: string;
  label: string;
  /**
   * True for the single entry derived from `agent.model` — the model Eve
   * resolves at startup today. Exactly one normalized preset carries it.
   */
  isDeploymentDefault: boolean;
}

/** Reserved id for the entry synthesized from `agent.model`. */
export const DEPLOYMENT_DEFAULT_PRESET_ID = "deployment-default";

export interface SigilAgentConfig {
  model: SigilAgentModelConfig;
  presets?: SigilAgentModelPresetConfig[];
}

export interface SigilProductConfig {
  agent: SigilAgentConfig;
  auth: { registration: "closed" | "open" };
  branding: {
    accent: string;
    description: string;
    instanceLabel?: string | false;
    name: string;
    shareImageUrl: string;
    title: string;
  };
  imageEdit: {
    preset: string;
    quality: string;
  };
}

const CONFIG_REF = "application:sigil-chat";
const FIXTURE_PATH = "application/sigil-chat.yaml";
let defaultFixture: Promise<LoadedFixture<SigilProductConfig>> | undefined;

export function loadSigilConfigFixture(
  path?: string,
): Promise<LoadedFixture<SigilProductConfig>> {
  if (path !== undefined) return loadFixture(path);
  defaultFixture ??= loadFixture(defaultConfigPath());
  return defaultFixture;
}

export function normalizeSigilAgentModelConfig(
  model: SigilAgentModelConfig,
): NormalizedSigilAgentModelConfig {
  if (typeof model === "string") {
    return {
      provider: "codex",
      model,
      source: "bare-slug",
    };
  }
  return {
    provider: model.provider,
    model: model.model,
    ...(model.baseUrl !== undefined ? { baseUrl: model.baseUrl } : {}),
    ...(model.apiKeyEnv !== undefined ? { apiKeyEnv: model.apiKeyEnv } : {}),
    ...(model.contextWindowTokens !== undefined
      ? { contextWindowTokens: model.contextWindowTokens }
      : {}),
    source: "object",
  };
}

/**
 * The full selectable model inventory for a deployment, deployment default
 * first.
 *
 * The default is synthesized from `agent.model` rather than required as a
 * preset so an existing fixture that never declares `presets` still produces a
 * one-row inventory — the list UI is never empty, and the entry Eve actually
 * runs today is always identifiable by `isDeploymentDefault`.
 */
export function normalizeSigilAgentModelPresets(
  agent: SigilAgentConfig,
): NormalizedSigilAgentModelPreset[] {
  const fallback = normalizeSigilAgentModelConfig(agent.model);
  return [
    {
      ...fallback,
      id: DEPLOYMENT_DEFAULT_PRESET_ID,
      label: deploymentDefaultLabel(fallback),
      isDeploymentDefault: true,
    },
    ...(agent.presets ?? []).map((preset) => ({
      ...normalizeSigilAgentModelConfig(preset),
      id: preset.id,
      label: preset.label,
      isDeploymentDefault: false,
    })),
  ];
}

function deploymentDefaultLabel(
  model: NormalizedSigilAgentModelConfig,
): string {
  return model.provider === "codex"
    ? `${model.model} (Codex subscription)`
    : `${model.model} (${model.provider})`;
}

function defaultConfigPath(): string {
  return join(
    resolveSigilProjectRoot(process.cwd()),
    "fixtures",
    "application",
    "sigil-chat.yaml",
  );
}

async function loadFixture(
  path: string,
): Promise<LoadedFixture<SigilProductConfig>> {
  const registry = createFixtureRegistry();
  registry.register(
    defineFixtureType<SigilProductConfig>({
      type: "application",
      directory: "application",
      extensions: [".yaml"],
      mergeStrategy: "deep",
      purpose: "raw",
      schema: sigilConfigSchema,
    }),
  );
  const source = createMemoryFixtureSource({
    id: "sigil-chat-repository",
    files: { [FIXTURE_PATH]: readFileSync(resolve(path), "utf8") },
  });
  const loader = createFixtureLoader({
    registry,
    sources: [source],
    parsers: { ".yaml": parseYaml },
  });
  return loader.loadRaw<SigilProductConfig>(CONFIG_REF);
}

const sigilConfigSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "sigil-chat",
    validate(value: unknown) {
      const issues = validateConfig(value);
      return issues.length > 0
        ? { issues }
        : { value: value as SigilProductConfig };
    },
  },
};

function validateConfig(value: unknown): StandardSchemaV1Issue[] {
  if (!isRecord(value)) return [{ message: "must be an object" }];
  const issues: StandardSchemaV1Issue[] = [];
  const agent = requireRecord(value, "agent", issues);
  const auth = requireRecord(value, "auth", issues);
  const branding = requireRecord(value, "branding", issues);
  const imageEdit = requireRecord(value, "imageEdit", issues);

  requireModelConfig(agent?.model, issues, ["agent", "model"]);
  requireModelPresets(agent?.presets, issues, ["agent", "presets"]);
  const registration = auth?.registration;
  if (registration !== "closed" && registration !== "open") {
    issues.push({
      message: 'must be "closed" or "open"',
      path: ["auth", "registration"],
    });
  }
  requireText(branding, "name", issues, ["branding", "name"]);
  requireText(branding, "title", issues, ["branding", "title"]);
  requireText(branding, "description", issues, ["branding", "description"]);
  requireText(branding, "shareImageUrl", issues, ["branding", "shareImageUrl"]);
  const accent = branding?.accent;
  if (typeof accent !== "string" || !/^#[0-9a-f]{6}$/i.test(accent)) {
    issues.push({
      message: "must be a six-digit hex color",
      path: ["branding", "accent"],
    });
  }
  const instanceLabel = branding?.instanceLabel;
  if (
    instanceLabel !== undefined &&
    instanceLabel !== false &&
    !isNonEmptyText(instanceLabel)
  ) {
    issues.push({
      message: "must be false or a non-empty string",
      path: ["branding", "instanceLabel"],
    });
  }
  requireText(imageEdit, "preset", issues, ["imageEdit", "preset"]);
  requireText(imageEdit, "quality", issues, ["imageEdit", "quality"]);
  return issues;
}

function requireRecord(
  value: Record<string, unknown>,
  key: string,
  issues: StandardSchemaV1Issue[],
): Record<string, unknown> | undefined {
  const candidate = value[key];
  if (isRecord(candidate)) return candidate;
  issues.push({ message: "must be an object", path: [key] });
  return undefined;
}

function requireText(
  value: Record<string, unknown> | undefined,
  key: string,
  issues: StandardSchemaV1Issue[],
  path: string[],
): void {
  if (isNonEmptyText(value?.[key])) return;
  issues.push({ message: "must be a non-empty string", path });
}

function requireModelConfig(
  candidate: unknown,
  issues: StandardSchemaV1Issue[],
  path: string[],
): void {
  if (isModelSlug(candidate)) return;
  if (isRecord(candidate)) {
    const provider = candidate.provider;
    if (!isSupportedModelProvider(provider)) {
      issues.push({
        message:
          'must be one of "codex", "openai-compatible", "openrouter", or "anthropic"',
        path: [...path, "provider"],
      });
    }
    if (!isModelSlug(candidate.model)) {
      issues.push({
        message: "must be a non-empty model id without whitespace",
        path: [...path, "model"],
      });
    }
    const baseUrl = candidate.baseUrl;
    if (baseUrl !== undefined && !isHttpUrl(baseUrl)) {
      issues.push({
        message: "must be an http(s) URL",
        path: [...path, "baseUrl"],
      });
    }
    const apiKeyEnv = candidate.apiKeyEnv;
    if (apiKeyEnv !== undefined && !isEnvironmentVariableName(apiKeyEnv)) {
      issues.push({
        message: "must be an environment variable name",
        path: [...path, "apiKeyEnv"],
      });
    }
    const contextWindowTokens = candidate.contextWindowTokens;
    if (
      contextWindowTokens !== undefined &&
      (typeof contextWindowTokens !== "number" ||
        !Number.isInteger(contextWindowTokens) ||
        contextWindowTokens <= 0)
    ) {
      issues.push({
        message: "must be a positive integer",
        path: [...path, "contextWindowTokens"],
      });
    }
    if (provider === "openai-compatible" && baseUrl === undefined) {
      issues.push({
        message: 'is required when provider is "openai-compatible"',
        path: [...path, "baseUrl"],
      });
    }
    return;
  }
  issues.push({ message: "must be a non-empty slug without whitespace", path });
}

/**
 * Presets are optional. When present each entry must carry a unique routable
 * id and a label on top of a valid model config — the fixture is the only
 * place a vendor is ever named, so a malformed entry has to fail here rather
 * than surface as an unselectable row in the endpoint list.
 */
function requireModelPresets(
  candidate: unknown,
  issues: StandardSchemaV1Issue[],
  path: string[],
): void {
  if (candidate === undefined) return;
  if (!Array.isArray(candidate)) {
    issues.push({ message: "must be a list of model presets", path });
    return;
  }
  const seen = new Set<string>();
  candidate.forEach((entry, index) => {
    const entryPath = [...path, String(index)];
    if (!isRecord(entry)) {
      issues.push({ message: "must be an object", path: entryPath });
      return;
    }
    const id = entry.id;
    const idPath = [...entryPath, "id"];
    if (!isPresetId(id)) {
      issues.push({
        message: "must be a lowercase slug (letters, digits, hyphens)",
        path: idPath,
      });
    } else if (id === DEPLOYMENT_DEFAULT_PRESET_ID) {
      issues.push({
        message: `must not be "${DEPLOYMENT_DEFAULT_PRESET_ID}" — that id is reserved for agent.model`,
        path: idPath,
      });
    } else if (seen.has(id)) {
      issues.push({ message: "must be unique across presets", path: idPath });
    } else {
      seen.add(id);
    }
    if (!isNonEmptyText(entry.label)) {
      issues.push({
        message: "must be a non-empty string",
        path: [...entryPath, "label"],
      });
    }
    requireModelConfig(entry, issues, entryPath);
  });
}

function isSupportedModelProvider(
  value: unknown,
): value is SigilAgentModelProvider {
  return (
    value === "codex" ||
    value === "openai-compatible" ||
    value === "openrouter" ||
    value === "anthropic"
  );
}

function isPresetId(value: unknown): value is string {
  return (
    typeof value === "string" && /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value)
  );
}

function isModelSlug(value: unknown): value is string {
  return isNonEmptyText(value) && !/\s/.test(value);
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isEnvironmentVariableName(value: unknown): value is string {
  return isNonEmptyText(value) && /^[A-Z_][A-Z0-9_]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
