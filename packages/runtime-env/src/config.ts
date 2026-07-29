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

export interface NormalizedSigilAgentModelConfig {
  provider: SigilAgentModelProvider;
  model: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  contextWindowTokens?: number;
  source: "bare-slug" | "object";
}

export interface SigilProductConfig {
  agent: { model: SigilAgentModelConfig };
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
