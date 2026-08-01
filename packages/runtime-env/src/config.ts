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

import {
  DEPLOYMENT_DEFAULT_PRESET_ID,
  DEPLOYMENT_DEFAULT_PROVIDER_ID,
} from "@workspace/runtime-env/constants";
import { resolveSigilProjectRoot } from "@workspace/runtime-env/project-root";

/** Transport kinds the resolver knows how to build. Not vendors. */
export type SigilAgentModelProvider =
  | "codex"
  | "openai-compatible"
  | "openrouter"
  | "anthropic";

/**
 * What a model is FOR. Chat is the only kind anything consumes today; the
 * others are declared so an embedding or voice model has an authoring home
 * that does not require reshaping this schema again.
 */
export type SigilModelCapability = "chat" | "embedding" | "voice";

/**
 * USD rate data for one model, authored per 1M tokens (the unit every vendor
 * quotes in). Optional everywhere: MDL.3 meters tokens regardless, and only
 * converts to a cost when both this and the metered direction are present —
 * an unpriced model is unpriced, never guessed at.
 */
export interface SigilAgentModelPricing {
  inputPerMillionTokens?: number;
  outputPerMillionTokens?: number;
}

export interface SigilAgentModelObjectConfig {
  provider: SigilAgentModelProvider;
  model: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  contextWindowTokens?: number;
  pricing?: SigilAgentModelPricing;
}

export type SigilAgentModelConfig = string | SigilAgentModelObjectConfig;

/**
 * Ordered reasoning-effort levels a model accepts, weakest first, plus which
 * one a session starts on.
 *
 * Declared, never sniffed (MDL.4): a model with no `reasoning` block shows no
 * reasoning control at all, rather than the app guessing what a provider
 * supports. The level strings are provider vocabulary passed through
 * verbatim by the resolver (e.g. codex/openai: "minimal" | "low" | "medium" |
 * "high" | "xhigh" | "max") — this schema does not constrain the set, because
 * that vocabulary is a provider fact, not an app one.
 */
export interface SigilAgentModelReasoningConfig {
  levels: string[];
  default: string;
}

/** One model offered by a provider. */
export interface SigilAgentProviderModelConfig {
  /** Slug, unique within its provider. Full id is `<providerId>/<id>`. */
  id: string;
  model: string;
  label?: string;
  /** Defaults to `chat`. */
  capability?: SigilModelCapability;
  /**
   * The author's veto. `false` makes this model unselectable everywhere, and
   * an installation owner cannot override it — enforced by
   * `isSelectableModelPreset` in the web app's model-selection.server.ts.
   * Note what `true` does NOT mean: a model still has to be enabled by an
   * owner before a new session may run it.
   */
  enabled?: boolean;
  contextWindowTokens?: number;
  /**
   * Reasoning-effort levels this model accepts. Absent means the model shows
   * no reasoning control (MDL.4 AC2/AC5) — never a hardcoded app default.
   */
  reasoning?: SigilAgentModelReasoningConfig;
  /**
   * Whether this model accepts a faster/cheaper request mode. Absent or
   * false means no fast-mode control is shown for it (MDL.4 AC3).
   */
  fastMode?: boolean;
  /** Overrides the provider's `pricing`, if any. */
  pricing?: SigilAgentModelPricing;
}

/**
 * A provider entry: the unit of model configuration (David, 2026-07-31).
 *
 * Provider-level facts — transport kind, endpoint, credential — are stated
 * once here, and the provider fans out the models it offers. Authoring one
 * flat row per model made the provider invisible and forced every row to
 * repeat the endpoint and credential it shared with its siblings.
 */
export interface SigilAgentProviderConfig {
  /** Slug. Namespaces every model id beneath it. */
  id: string;
  label: string;
  kind: SigilAgentModelProvider;
  baseUrl?: string;
  apiKeyEnv?: string;
  /** Default context window for this provider's models. */
  contextWindowTokens?: number;
  /** Default rate data for this provider's models; a model's own `pricing` wins. */
  pricing?: SigilAgentModelPricing;
  /**
   * The author's veto over this provider and every model beneath it. An owner
   * cannot re-enable it from the installation allow-list — that set narrows
   * what the author permitted, it never widens it.
   */
  enabled?: boolean;
  models: SigilAgentProviderModelConfig[];
}

export interface NormalizedSigilAgentModelConfig {
  provider: SigilAgentModelProvider;
  model: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  contextWindowTokens?: number;
  pricing?: SigilAgentModelPricing;
  source: "bare-slug" | "object";
}

/**
 * A flattened, selectable model.
 *
 * `id` is what a session binds to and is stable across a fixture edit as long
 * as the provider and model slugs keep their names.
 */
export interface NormalizedSigilAgentModelPreset
  extends NormalizedSigilAgentModelConfig {
  /** `<providerId>/<modelId>`, or the reserved deployment-default id. */
  id: string;
  label: string;
  providerId: string;
  providerLabel: string;
  capability: SigilModelCapability;
  /** Both levels resolved: a model in a disabled provider is disabled. */
  enabled: boolean;
  isDeploymentDefault: boolean;
  /** Absent means this preset declares no reasoning control (MDL.4). */
  reasoning?: SigilAgentModelReasoningConfig;
  /** Defaults to false — the deployment default and any undeclared preset. */
  fastMode: boolean;
}

/** Provider-shaped inventory: the authored structure, normalized. */
export interface NormalizedSigilAgentProvider {
  id: string;
  label: string;
  kind: SigilAgentModelProvider;
  baseUrl?: string;
  apiKeyEnv?: string;
  enabled: boolean;
  models: NormalizedSigilAgentModelPreset[];
}

// Defined in ./constants (client-safe, no Node imports) and re-exported here so
// existing importers of this module keep resolving them from one definition.
export { DEPLOYMENT_DEFAULT_PRESET_ID, DEPLOYMENT_DEFAULT_PROVIDER_ID };

export interface SigilAgentConfig {
  model: SigilAgentModelConfig;
  providers?: SigilAgentProviderConfig[];
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
    ...(model.pricing !== undefined ? { pricing: model.pricing } : {}),
    source: "object",
  };
}

/**
 * Provider-shaped inventory, deployment default first.
 *
 * The default is synthesized as its own single-model provider rather than
 * required in `providers`, so a fixture that declares none still yields a
 * one-entry inventory and the model Eve actually runs is always identifiable.
 */
export function normalizeSigilAgentProviders(
  agent: SigilAgentConfig,
): NormalizedSigilAgentProvider[] {
  const fallback = normalizeSigilAgentModelConfig(agent.model);
  const deploymentDefault: NormalizedSigilAgentModelPreset = {
    ...fallback,
    id: DEPLOYMENT_DEFAULT_PRESET_ID,
    label: fallback.model,
    providerId: DEPLOYMENT_DEFAULT_PROVIDER_ID,
    providerLabel: deploymentProviderLabel(fallback),
    capability: "chat",
    enabled: true,
    isDeploymentDefault: true,
    // The deployment default is authored as `agent.model`, a bare slug or a
    // credential-only object — that shape has no room for a reasoning/fastMode
    // declaration today, so it never shows either control. Declaring one for
    // the default would need widening SigilAgentModelObjectConfig, which is
    // out of MDL.4's scope; every AUTHORED provider preset below can declare
    // both.
    fastMode: false,
  };

  return [
    {
      id: DEPLOYMENT_DEFAULT_PROVIDER_ID,
      label: deploymentProviderLabel(fallback),
      kind: fallback.provider,
      ...(fallback.baseUrl !== undefined ? { baseUrl: fallback.baseUrl } : {}),
      ...(fallback.apiKeyEnv !== undefined
        ? { apiKeyEnv: fallback.apiKeyEnv }
        : {}),
      enabled: true,
      models: [deploymentDefault],
    },
    ...(agent.providers ?? []).map((provider) => {
      const providerEnabled = provider.enabled ?? true;
      return {
        id: provider.id,
        label: provider.label,
        kind: provider.kind,
        ...(provider.baseUrl !== undefined
          ? { baseUrl: provider.baseUrl }
          : {}),
        ...(provider.apiKeyEnv !== undefined
          ? { apiKeyEnv: provider.apiKeyEnv }
          : {}),
        enabled: providerEnabled,
        models: provider.models.map((entry) => {
          const contextWindowTokens =
            entry.contextWindowTokens ?? provider.contextWindowTokens;
          const pricing = entry.pricing ?? provider.pricing;
          return {
            provider: provider.kind,
            model: entry.model,
            ...(provider.baseUrl !== undefined
              ? { baseUrl: provider.baseUrl }
              : {}),
            ...(provider.apiKeyEnv !== undefined
              ? { apiKeyEnv: provider.apiKeyEnv }
              : {}),
            ...(contextWindowTokens !== undefined
              ? { contextWindowTokens }
              : {}),
            ...(pricing !== undefined ? { pricing } : {}),
            source: "object" as const,
            id: `${provider.id}/${entry.id}`,
            label: entry.label ?? entry.model,
            providerId: provider.id,
            providerLabel: provider.label,
            capability: entry.capability ?? "chat",
            // A model inside a disabled provider is disabled regardless of
            // its own flag: the provider is the credential holder.
            enabled: providerEnabled && (entry.enabled ?? true),
            isDeploymentDefault: false,
            ...(entry.reasoning ? { reasoning: entry.reasoning } : {}),
            fastMode: entry.fastMode ?? false,
          };
        }),
      };
    }),
  ];
}

/**
 * Every selectable model, flattened, deployment default first.
 *
 * Kept as the flattener over the provider shape so callers that only care
 * about "which models exist" do not have to walk the tree.
 */
export function normalizeSigilAgentModelPresets(
  agent: SigilAgentConfig,
): NormalizedSigilAgentModelPreset[] {
  return normalizeSigilAgentProviders(agent).flatMap(
    (provider) => provider.models,
  );
}

function deploymentProviderLabel(
  model: NormalizedSigilAgentModelConfig,
): string {
  return model.provider === "codex"
    ? "Codex subscription"
    : `Deployment default (${model.provider})`;
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
  requireProviders(agent?.providers, issues, ["agent", "providers"]);
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
      !isPositiveInteger(contextWindowTokens)
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
    requirePricing(candidate.pricing, issues, [...path, "pricing"]);
    return;
  }
  issues.push({ message: "must be a non-empty slug without whitespace", path });
}

/**
 * Both rates are optional independently — a model priced only on input (or
 * only on output) is a real fixture shape, not an error — but a present rate
 * must be a non-negative number.
 */
function requirePricing(
  candidate: unknown,
  issues: StandardSchemaV1Issue[],
  path: string[],
): void {
  if (candidate === undefined) return;
  if (!isRecord(candidate)) {
    issues.push({ message: "must be an object", path });
    return;
  }
  const { inputPerMillionTokens, outputPerMillionTokens } = candidate;
  if (
    inputPerMillionTokens !== undefined &&
    !isNonNegativeNumber(inputPerMillionTokens)
  ) {
    issues.push({
      message: "must be a non-negative number",
      path: [...path, "inputPerMillionTokens"],
    });
  }
  if (
    outputPerMillionTokens !== undefined &&
    !isNonNegativeNumber(outputPerMillionTokens)
  ) {
    issues.push({
      message: "must be a non-negative number",
      path: [...path, "outputPerMillionTokens"],
    });
  }
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Providers are optional; when present every entry must carry a unique slug,
 * a label, a supported kind, and at least one model. The fixture is the only
 * place a vendor is named, so a malformed entry fails here rather than
 * surfacing as an unusable row in the endpoint list.
 */
function requireProviders(
  candidate: unknown,
  issues: StandardSchemaV1Issue[],
  path: string[],
): void {
  if (candidate === undefined) return;
  if (!Array.isArray(candidate)) {
    issues.push({ message: "must be a list of providers", path });
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
    if (!isSlug(id)) {
      issues.push({
        message: "must be a lowercase slug (letters, digits, hyphens)",
        path: idPath,
      });
    } else if (id === DEPLOYMENT_DEFAULT_PROVIDER_ID) {
      issues.push({
        message: `must not be "${DEPLOYMENT_DEFAULT_PROVIDER_ID}" — that id is reserved for agent.model`,
        path: idPath,
      });
    } else if (seen.has(id)) {
      issues.push({ message: "must be unique across providers", path: idPath });
    } else {
      seen.add(id);
    }
    if (!isNonEmptyText(entry.label)) {
      issues.push({
        message: "must be a non-empty string",
        path: [...entryPath, "label"],
      });
    }
    if (!isSupportedModelProvider(entry.kind)) {
      issues.push({
        message:
          'must be one of "codex", "openai-compatible", "openrouter", or "anthropic"',
        path: [...entryPath, "kind"],
      });
    }
    const baseUrl = entry.baseUrl;
    if (baseUrl !== undefined && !isHttpUrl(baseUrl)) {
      issues.push({
        message: "must be an http(s) URL",
        path: [...entryPath, "baseUrl"],
      });
    }
    if (entry.kind === "openai-compatible" && baseUrl === undefined) {
      issues.push({
        message: 'is required when kind is "openai-compatible"',
        path: [...entryPath, "baseUrl"],
      });
    }
    if (
      entry.apiKeyEnv !== undefined &&
      !isEnvironmentVariableName(entry.apiKeyEnv)
    ) {
      issues.push({
        message: "must be an environment variable name",
        path: [...entryPath, "apiKeyEnv"],
      });
    }
    if (
      entry.contextWindowTokens !== undefined &&
      !isPositiveInteger(entry.contextWindowTokens)
    ) {
      issues.push({
        message: "must be a positive integer",
        path: [...entryPath, "contextWindowTokens"],
      });
    }
    if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") {
      issues.push({
        message: "must be true or false",
        path: [...entryPath, "enabled"],
      });
    }
    requirePricing(entry.pricing, issues, [...entryPath, "pricing"]);
    requireProviderModels(entry.models, issues, [...entryPath, "models"]);
  });
}

function requireProviderModels(
  candidate: unknown,
  issues: StandardSchemaV1Issue[],
  path: string[],
): void {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    issues.push({ message: "must be a non-empty list of models", path });
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
    if (!isSlug(id)) {
      issues.push({
        message: "must be a lowercase slug (letters, digits, hyphens)",
        path: idPath,
      });
    } else if (seen.has(id)) {
      issues.push({
        message: "must be unique within its provider",
        path: idPath,
      });
    } else {
      seen.add(id);
    }
    if (!isModelSlug(entry.model)) {
      issues.push({
        message: "must be a non-empty model id without whitespace",
        path: [...entryPath, "model"],
      });
    }
    if (entry.label !== undefined && !isNonEmptyText(entry.label)) {
      issues.push({
        message: "must be a non-empty string",
        path: [...entryPath, "label"],
      });
    }
    if (
      entry.capability !== undefined &&
      entry.capability !== "chat" &&
      entry.capability !== "embedding" &&
      entry.capability !== "voice"
    ) {
      issues.push({
        message: 'must be one of "chat", "embedding", or "voice"',
        path: [...entryPath, "capability"],
      });
    }
    if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") {
      issues.push({
        message: "must be true or false",
        path: [...entryPath, "enabled"],
      });
    }
    if (
      entry.contextWindowTokens !== undefined &&
      !isPositiveInteger(entry.contextWindowTokens)
    ) {
      issues.push({
        message: "must be a positive integer",
        path: [...entryPath, "contextWindowTokens"],
      });
    }
    if (entry.fastMode !== undefined && typeof entry.fastMode !== "boolean") {
      issues.push({
        message: "must be true or false",
        path: [...entryPath, "fastMode"],
      });
    }
    requireReasoningConfig(entry.reasoning, issues, [...entryPath, "reasoning"]);
    requirePricing(entry.pricing, issues, [...entryPath, "pricing"]);
  });
}

/**
 * Optional per-model reasoning declaration (MDL.4): an ordered, non-empty
 * list of provider-vocabulary levels plus a default that is one of them. Not
 * validating the level strings against a fixed set is deliberate — that
 * vocabulary belongs to the provider, not this schema.
 */
function requireReasoningConfig(
  candidate: unknown,
  issues: StandardSchemaV1Issue[],
  path: string[],
): void {
  if (candidate === undefined) return;
  if (!isRecord(candidate)) {
    issues.push({ message: "must be an object", path });
    return;
  }
  const levels = candidate.levels;
  const levelsPath = [...path, "levels"];
  const validLevels =
    Array.isArray(levels) &&
    levels.length > 0 &&
    levels.every((level) => isNonEmptyText(level));
  if (!validLevels) {
    issues.push({
      message: "must be a non-empty list of non-empty strings",
      path: levelsPath,
    });
  }
  const defaultLevel = candidate.default;
  if (!isNonEmptyText(defaultLevel)) {
    issues.push({
      message: "must be a non-empty string",
      path: [...path, "default"],
    });
  } else if (validLevels && !(levels as unknown[]).includes(defaultLevel)) {
    issues.push({
      message: "must be one of reasoning.levels",
      path: [...path, "default"],
    });
  }
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

function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" && /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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
