import { readFileSync } from "node:fs";
import {
  readRuntimeTopology,
  RuntimeEnvironmentError,
  type RuntimeEnvironment,
  type SigilRuntimeTopology,
} from "./topology.js";

export const DEFAULT_CODEX_MODEL = "gpt-5.6-terra";

export interface GonkServerEnvironment extends SigilRuntimeTopology {
  apiKey: string | undefined;
  port: number;
}

export interface GonkClientEnvironment extends SigilRuntimeTopology {
  apiKey: string | undefined;
}

export interface AgentRuntimeEnvironment {
  model: string;
}

export interface StorageRuntimeEnvironment {
  graphPath: string | undefined;
  reviewPath: string | undefined;
}

export function readAgentEnvironment(
  env: RuntimeEnvironment,
): AgentRuntimeEnvironment {
  const model = env.CODEX_MODEL;
  if (model === undefined) return { model: DEFAULT_CODEX_MODEL };
  const normalized = model.trim();
  if (!normalized || /\s/.test(normalized)) {
    throw new RuntimeEnvironmentError(
      "INVALID_MODEL",
      "CODEX_MODEL",
      "must be a non-empty model slug without whitespace",
    );
  }
  return { model: normalized };
}

export function readStorageEnvironment(
  env: RuntimeEnvironment,
): StorageRuntimeEnvironment {
  return {
    graphPath: parseOptionalStoragePath(
      env.SIGIL_CHAT_GRAPH_PATH,
      "SIGIL_CHAT_GRAPH_PATH",
    ),
    reviewPath: parseOptionalStoragePath(
      env.SIGIL_CHAT_REVIEW_PATH,
      "SIGIL_CHAT_REVIEW_PATH",
    ),
  };
}

export function readGonkClientEnvironment(
  env: RuntimeEnvironment,
): GonkClientEnvironment {
  return {
    ...readRuntimeTopology(env),
    apiKey: readOptionalSecretFromFile(env, "GONK_MCP_KEY"),
  };
}

export function readGonkServerEnvironment(
  env: RuntimeEnvironment,
): GonkServerEnvironment {
  return {
    ...readGonkClientEnvironment(env),
    port: parsePort(env.PORT, 8808, "PORT"),
  };
}

export function readOptionalSecretFromFile(
  env: RuntimeEnvironment,
  name: string,
): string | undefined {
  const fileName = `${name}_FILE`;
  const inline = env[name]?.trim();
  if (inline) return inline;

  const secretFile = env[fileName]?.trim();
  if (!secretFile) return undefined;

  try {
    const secret = readFileSync(secretFile, "utf8").toString().trim();
    if (!secret) {
      throw new RuntimeEnvironmentError(
        "INVALID_SECRET",
        fileName,
        `${name} file is empty`,
      );
    }
    return secret;
  } catch (error) {
    if (error instanceof RuntimeEnvironmentError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RuntimeEnvironmentError(
        "INVALID_SECRET",
        fileName,
        "secret file does not exist",
      );
    }
    throw new RuntimeEnvironmentError(
      "INVALID_SECRET",
      fileName,
      `could not read secret file: ${error}`,
    );
  }
}

export function parsePort(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  if (!/^\d+$/.test(candidate)) throw invalidPort(name);
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw invalidPort(name);
  }
  return port;
}

function parseOptionalStoragePath(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) return undefined;
  const path = value.trim();
  if (!path || path.includes("\0")) {
    throw new RuntimeEnvironmentError(
      "INVALID_STORAGE_PATH",
      name,
      "must be a non-empty filesystem path without null bytes",
    );
  }
  return path;
}

function invalidPort(name: string): RuntimeEnvironmentError {
  return new RuntimeEnvironmentError(
    "INVALID_PORT",
    name,
    "must be an integer between 1 and 65535",
  );
}
