import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ContextCompiler, ContextContributorRegistry } from "@gonk/context";
import { fixtureResourceProvider } from "../gonk/resource-provider.js";

const token = "fixture-smoke-key";
const port = 4317;
type RpcResponse = {
  headers: Headers;
  result?: { structuredContent?: { value?: unknown } };
};
const tsxCli = fileURLToPath(
  new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
);
const child = spawn(process.execPath, [tsxCli, "gonk/server.ts"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, GONK_MCP_KEY: token, PORT: String(port) },
  stdio: "inherit",
});

try {
  const sessionId = await initialize();
  const call = await rpc(sessionId, 2, "tools/call", {
    name: "fixture-echo",
    arguments: { message: "clean room" },
  });
  const value = call.result?.structuredContent?.value as
    | { message?: string }
    | undefined;
  if (value?.message !== "clean room")
    throw new Error("MCP tool result mismatched");

  const contributors = new ContextContributorRegistry();
  contributors.register(fixtureResourceProvider);
  const compiled = await new ContextCompiler({
    registry: contributors,
  }).compile({
    requestId: "fixture-turn",
    audience: "model",
    maxTokens: 100,
    auth: {
      principal: {
        id: "fixture-principal",
        kind: "service",
        identity: {
          issuer: "fixture",
          subject: "fixture",
          method: "service-token",
        },
        roles: [],
        scopes: [],
      },
      authorize: () => ({ outcome: "allow", reason: "Fixture test" }),
    },
  });
  if (
    compiled.status !== "ready" ||
    !compiled.content.includes("Fixture resource")
  ) {
    throw new Error("Fixture resource provider did not compile");
  }
} finally {
  child.kill("SIGTERM");
}

console.log("external-consumer fixture smoke verified");

async function initialize() {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await rpc(undefined, 1, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "external-consumer-fixture", version: "0" },
      });
      const sessionId = response.headers.get("mcp-session-id");
      if (!sessionId)
        throw new Error("MCP initialize did not return a session id");
      await notify(sessionId, "notifications/initialized", {});
      return sessionId;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

async function notify(sessionId: string, method: string, params: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params }),
  });
  if (!response.ok) throw new Error(`MCP ${method} failed: ${response.status}`);
}

async function rpc(
  sessionId: string | undefined,
  id: number | undefined,
  method: string,
  params: unknown,
): Promise<RpcResponse> {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      ...(id === undefined ? {} : { id }),
      method,
      params,
    }),
  });
  if (!response.ok) throw new Error(`MCP ${method} failed: ${response.status}`);
  return {
    headers: response.headers,
    ...((await response.json()) as Omit<RpcResponse, "headers">),
  };
}
