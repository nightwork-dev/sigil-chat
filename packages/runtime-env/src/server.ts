import {
  readRuntimeTopology,
  type RuntimeEnvironment,
  type SigilRuntimeTopology,
} from "./topology.js";

export interface GonkServerEnvironment extends SigilRuntimeTopology {
  apiKey: string | undefined;
  port: number;
}

export interface GonkClientEnvironment extends SigilRuntimeTopology {
  apiKey: string | undefined;
}

export function readGonkClientEnvironment(
  env: RuntimeEnvironment,
): GonkClientEnvironment {
  return {
    ...readRuntimeTopology(env),
    apiKey: readOptionalSecret(env.GONK_MCP_KEY),
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

export function readOptionalSecret(
  value: string | undefined,
): string | undefined {
  const secret = value?.trim();
  return secret || undefined;
}

export function parsePort(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  if (!/^\d+$/.test(candidate)) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}
