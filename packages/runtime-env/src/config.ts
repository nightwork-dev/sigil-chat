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

export interface SigilProductConfig {
  agent: { model: string };
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

  requireSlug(agent, "model", issues, ["agent", "model"]);
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

function requireSlug(
  value: Record<string, unknown> | undefined,
  key: string,
  issues: StandardSchemaV1Issue[],
  path: string[],
): void {
  const candidate = value?.[key];
  if (isNonEmptyText(candidate) && !/\s/.test(candidate)) return;
  issues.push({ message: "must be a non-empty slug without whitespace", path });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
