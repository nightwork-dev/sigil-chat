import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  readRuntimeTopology,
  parseHttpUrl,
  RuntimeEnvironmentError,
  type RuntimeEnvironment,
  type SigilRuntimeTopology,
} from "./topology.js";
import { resolveSigilProjectRoot } from "./project-root.js";

export interface GonkServerEnvironment extends SigilRuntimeTopology {
  apiKey: string | undefined;
  port: number;
}

export interface GonkClientEnvironment extends SigilRuntimeTopology {
  apiKey: string | undefined;
}

export interface StorageRuntimeEnvironment {
  graphPath: string;
  reviewPath: string;
}

export interface IdentityRuntimeEnvironment {
  personaDir: string;
  memoryDir: string;
}

export interface DataRuntimeEnvironment
  extends StorageRuntimeEnvironment, IdentityRuntimeEnvironment {
  artifactDir: string;
  blackboardDir: string;
  containerRegistryRoot: string;
  identityDir: string;
  rootDir: string;
}

export interface DisabledEmbeddingRuntimeEnvironment {
  enabled: false;
}

export interface EnabledEmbeddingRuntimeEnvironment {
  enabled: true;
  baseURL: string;
  model: string;
  dim: number | undefined;
  apiKey: string | undefined;
}

export type EmbeddingRuntimeEnvironment =
  DisabledEmbeddingRuntimeEnvironment | EnabledEmbeddingRuntimeEnvironment;

export function readEmbeddingEnvironment(
  env: RuntimeEnvironment,
): EmbeddingRuntimeEnvironment {
  const baseURL = env.SIGIL_EMBEDDING_BASE_URL?.trim();
  const model = env.SIGIL_EMBEDDING_MODEL?.trim();

  // The provider is optional as a group. A partial configuration must not
  // accidentally turn on a client with an unusable endpoint or model.
  if (!baseURL || !model) return { enabled: false };

  return {
    enabled: true,
    baseURL: parseHttpUrl(baseURL, baseURL, "SIGIL_EMBEDDING_BASE_URL"),
    model,
    dim: parseOptionalEmbeddingDimension(env.SIGIL_EMBEDDING_DIM),
    apiKey: env.SIGIL_EMBEDDING_API_KEY?.trim() || undefined,
  };
}

export function readStorageEnvironment(
  env: RuntimeEnvironment,
  cwd: string = process.cwd(),
): StorageRuntimeEnvironment {
  const data = readDataEnvironment(env, cwd);
  return {
    graphPath: resolveStoragePath(
      env.SIGIL_CHAT_GRAPH_PATH,
      "SIGIL_CHAT_GRAPH_PATH",
      data.graphPath,
      cwd,
    ),
    reviewPath: resolveStoragePath(
      env.SIGIL_CHAT_REVIEW_PATH,
      "SIGIL_CHAT_REVIEW_PATH",
      data.reviewPath,
      cwd,
    ),
  };
}

/** Resolve disposable, local-first application state from one root. Individual
 * store variables remain supported for deployments that isolate mounts per
 * service, but ordinary development and small installations need only
 * SIGIL_DATA_DIR (or no setting at all). */
export function readDataEnvironment(
  env: RuntimeEnvironment,
  cwd: string = process.cwd(),
): DataRuntimeEnvironment {
  const configuredRoot = parseOptionalStoragePath(
    env.SIGIL_DATA_DIR,
    "SIGIL_DATA_DIR",
  );
  const rootDir = configuredRoot
    ? resolve(cwd, configuredRoot)
    : resolveProjectDataRoot(cwd);
  const identityDir = join(rootDir, "identity");
  return {
    artifactDir: join(rootDir, "artifacts"),
    blackboardDir: join(rootDir, "blackboard"),
    containerRegistryRoot: join(rootDir, "containers"),
    graphPath: join(rootDir, "graph"),
    identityDir,
    memoryDir: join(identityDir, "memory"),
    personaDir: join(identityDir, "persona"),
    reviewPath: join(rootDir, "review"),
    rootDir,
  };
}

/** Resolve the identity store shared by the web and Eve workspace packages.
 * Local package scripts run from apps/<host>, so their common default is the
 * repository-level .data directory. Deployments should provide explicit
 * mounted paths through SIGIL_PERSONA_DIR and SIGIL_MEMORY_DIR. */
export function readIdentityEnvironment(
  env: RuntimeEnvironment,
  cwd: string = process.cwd(),
): IdentityRuntimeEnvironment {
  const data = readDataEnvironment(env, cwd);
  return {
    personaDir: resolveStoragePath(
      env.SIGIL_PERSONA_DIR,
      "SIGIL_PERSONA_DIR",
      data.personaDir,
      cwd,
    ),
    memoryDir: resolveStoragePath(
      env.SIGIL_MEMORY_DIR,
      "SIGIL_MEMORY_DIR",
      data.memoryDir,
      cwd,
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

function parseOptionalEmbeddingDimension(
  value: string | undefined,
): number | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (!/^\d+$/.test(candidate)) {
    throw new RuntimeEnvironmentError(
      "INVALID_EMBEDDING_DIM",
      "SIGIL_EMBEDDING_DIM",
      "must be a positive integer",
    );
  }
  const dim = Number(candidate);
  if (!Number.isSafeInteger(dim) || dim < 1) {
    throw new RuntimeEnvironmentError(
      "INVALID_EMBEDDING_DIM",
      "SIGIL_EMBEDDING_DIM",
      "must be a positive integer",
    );
  }
  return dim;
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

function resolveStoragePath(
  value: string | undefined,
  name: string,
  fallback: string,
  cwd: string,
): string {
  const configured = parseOptionalStoragePath(value, name);
  return configured ? resolve(cwd, configured) : fallback;
}

function resolveProjectDataRoot(startDirectory: string): string {
  return join(resolveSigilProjectRoot(startDirectory), ".data");
}

function invalidPort(name: string): RuntimeEnvironmentError {
  return new RuntimeEnvironmentError(
    "INVALID_PORT",
    name,
    "must be an integer between 1 and 65535",
  );
}
