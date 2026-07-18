import { afterEach, describe, expect, it } from "vitest";

import { createOrchestrator } from "@gonk/tool-orchestrator";
import { ToolRegistry, passthrough } from "@gonk/tool-registry";
import type { WebMcpHandler } from "@gonk/tool-registry-mcp/http";
import {
  createAgentMcpBearerHeaders,
  createAgentWebMcpHandler,
  type AgentMcpAuthorizationPolicy,
} from "@zigil/agent-gonk";

import { authorizeSigilMcpRequest } from "../src/auth.js";
import { createSigilRegistry, sigilApprovalProvider } from "../src/registry.js";

const endpoint = "http://sigil.test/mcp";
const token = "sigil-test-token";
const handlers: WebMcpHandler[] = [];

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.close()));
});

function request(body: unknown, sessionId?: string): Request {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...createAgentMcpBearerHeaders(token),
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function initialize(handler: WebMcpHandler): Promise<string> {
  const response = await handler.handle(
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "sigil-auth-integration", version: "0" },
      },
    }),
  );
  expect(response.status).toBe(200);
  const sessionId = response.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  await handler.handle(
    request(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      sessionId!,
    ),
  );
  return sessionId!;
}

async function rpc(
  handler: WebMcpHandler,
  sessionId: string,
  id: number,
  method: string,
  params: unknown,
): Promise<Record<string, unknown>> {
  const response = await handler.handle(
    request({ jsonrpc: "2.0", id, method, params }, sessionId),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

function webHandler(
  source: ToolRegistry | ReturnType<typeof createOrchestrator>,
  authorize: AgentMcpAuthorizationPolicy = authorizeSigilMcpRequest,
): WebMcpHandler {
  const handler = createAgentWebMcpHandler({
    source,
    serverName: "sigil-auth-integration",
    serverVersion: "0",
    apiKey: token,
    enableJsonResponse: true,
    authorize,
    writeToolPolicy: "permissive",
  });
  handlers.push(handler);
  return handler;
}

describe("published Gonk 0.2.0 and Sigil Agent Gonk 0.1.1 compatibility", () => {
  it("preserves Sigil registry MCP initialize, list, call, and masked error parity", async () => {
    const registry = createSigilRegistry();
    const handler = webHandler(registry, ({ request }) =>
      request.resource.target === "sigil-ui-highlight"
        ? { outcome: "deny", reason: "Hidden from this principal" }
        : { outcome: "allow", reason: "Visible to this principal" },
    );
    const sessionId = await initialize(handler);

    const listed = await rpc(handler, sessionId, 2, "tools/list", {});
    expect((listed.result as { tools: unknown[] }).tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "sigil-chat-status",
          description:
            "Report the live Sigil Chat runtime architecture and server time.",
        }),
        expect.objectContaining({
          name: "sigil-graph-edit",
          inputSchema: expect.objectContaining({
            required: ["actions"],
          }),
        }),
        expect.objectContaining({
          name: "sigil-review-add-annotation",
          annotations: expect.objectContaining({
            readOnlyHint: false,
          }),
        }),
        expect.objectContaining({
          name: "sigil-story-list",
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              expectedRevision: expect.anything(),
            }),
          }),
        }),
        expect.objectContaining({ name: "sigil-list-session-files" }),
        expect.objectContaining({
          name: "sigil-read-file",
          inputSchema: expect.objectContaining({ required: ["id"] }),
        }),
      ]),
    );
    expect((listed.result as { tools: unknown[] }).tools).toHaveLength(26);
    expect(JSON.stringify(listed)).not.toContain("sigil-ui-highlight");

    const visibleCall = await rpc(handler, sessionId, 3, "tools/call", {
      name: "sigil-chat-status",
      arguments: {},
    });
    expect(visibleCall).toMatchObject({
      result: {
        structuredContent: {
          application: "sigil-chat",
          toolRegistry: "gonk",
          transport: "mcp-streamable-http",
        },
      },
    });

    const malformedCall = await rpc(handler, sessionId, 4, "tools/call", {
      name: "sigil-graph-add-node",
      arguments: { reducerId: 42 },
    });
    expect(malformedCall).toMatchObject({
      result: {
        isError: true,
        structuredContent: {
          error: {
            code: "INVALID_INPUT",
            message: "Input validation failed",
          },
        },
      },
    });

    const hiddenCall = await rpc(handler, sessionId, 5, "tools/call", {
      name: "sigil-ui-highlight",
      arguments: {},
    });
    const unknownCall = await rpc(handler, sessionId, 6, "tools/call", {
      name: "sigil-does-not-exist",
      arguments: {},
    });
    const normalizeRequestedName = (value: unknown) =>
      JSON.stringify(value)
        .replaceAll("sigil-ui-highlight", "<requested-tool>")
        .replaceAll("sigil-does-not-exist", "<requested-tool>")
        .replace(/"id":\d+/, '"id":0');
    expect(normalizeRequestedName(hiddenCall)).toBe(
      normalizeRequestedName(unknownCall),
    );
    expect(JSON.stringify(hiddenCall)).not.toContain(
      "Return a structured client command",
    );

    const deniedRegistry = new ToolRegistry({
      security: { approvalProvider: sigilApprovalProvider },
    });
    deniedRegistry.register({
      name: "sigil-test-exec-denied",
      description: "Exercise Sigil approval denial over MCP.",
      approval: "exec",
      input: passthrough(),
      handler: async () => ({ data: { executed: true } }),
    });
    const deniedHandler = webHandler(deniedRegistry);
    const deniedSessionId = await initialize(deniedHandler);
    const deniedCall = await rpc(
      deniedHandler,
      deniedSessionId,
      7,
      "tools/call",
      {
        name: "sigil-test-exec-denied",
        arguments: {},
      },
    );
    expect(deniedCall).toMatchObject({
      result: {
        isError: true,
        structuredContent: {
          error: {
            code: "APPROVAL_DENIED",
            message: "Sigil Chat does not permit executable MCP tools",
          },
        },
      },
    });
  });

  it("propagates the authenticated bearer principal into the real tool context", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "sigil-test-whoami",
      description:
        "Return the authenticated principal for integration testing.",
      approval: "read",
      input: passthrough(),
      handler: async (_input, context) => ({
        data: { principal: context.auth?.principal },
      }),
    });
    const handler = webHandler(registry);
    const sessionId = await initialize(handler);

    const response = await rpc(handler, sessionId, 2, "tools/call", {
      name: "sigil-test-whoami",
      arguments: {},
    });

    expect(response).toMatchObject({
      result: {
        structuredContent: {
          principal: {
            kind: "service",
            identity: {
              issuer: "gonk:static-bearer",
              subject: "static-bearer",
              method: "service-token",
            },
          },
        },
      },
    });
  });

  it("returns structured APPROVAL_REQUIRED without executing the tool", async () => {
    let executed = false;
    const registry = new ToolRegistry({
      security: {
        requestId: () => "sigil-request-1",
        approvalProvider: {
          decide: () => ({
            outcome: "required",
            reason: "Ask the Sigil user",
            approvalRequestId: "sigil-approval-1",
          }),
        },
      },
    });
    registry.register({
      name: "sigil-test-exec",
      description: "Exercise structured approval outcomes.",
      approval: "exec",
      input: passthrough(),
      handler: async () => {
        executed = true;
        return { data: { executed: true } };
      },
    });
    const handler = webHandler(registry);
    const sessionId = await initialize(handler);

    const response = await rpc(handler, sessionId, 2, "tools/call", {
      name: "sigil-test-exec",
      arguments: {},
    });

    expect(response).toMatchObject({
      result: {
        isError: true,
        structuredContent: {
          error: {
            code: "APPROVAL_REQUIRED",
            details: {
              requestId: "sigil-request-1",
              approvalRequestId: "sigil-approval-1",
              approvalTier: "exec",
              toolName: "sigil-test-exec",
            },
          },
        },
      },
    });
    expect(executed).toBe(false);
  });

  it("enforces Sigil's production exec-tier denial through the registry provider", async () => {
    let executed = false;
    const registry = new ToolRegistry({
      security: { approvalProvider: sigilApprovalProvider },
    });
    registry.register({
      name: "sigil-test-production-exec",
      description: "Exercise Sigil's production consent policy.",
      approval: "exec",
      input: passthrough(),
      handler: async () => {
        executed = true;
        return { data: { executed: true } };
      },
    });
    const handler = webHandler(registry);
    const sessionId = await initialize(handler);

    const response = await rpc(handler, sessionId, 2, "tools/call", {
      name: "sigil-test-production-exec",
      arguments: {},
    });

    expect(response).toMatchObject({
      result: {
        isError: true,
        structuredContent: {
          error: {
            code: "APPROVAL_DENIED",
            message: "Sigil Chat does not permit executable MCP tools",
          },
        },
      },
    });
    expect(executed).toBe(false);
  });

  it("filters denied tools from discovery before disclosing their metadata", async () => {
    let hiddenExecuted = false;
    const registry = new ToolRegistry();
    registry.register([
      {
        name: "sigil-test-visible",
        description: "Visible tool.",
        approval: "read",
        input: passthrough(),
        handler: async () => ({ data: { visible: true } }),
      },
      {
        name: "sigil-test-hidden",
        description: "Sensitive hidden description.",
        approval: "read",
        input: passthrough(),
        handler: async () => {
          hiddenExecuted = true;
          return { data: { hidden: true } };
        },
      },
    ]);
    const handler = webHandler(registry, ({ request }) =>
      request.resource.target === "sigil-test-hidden"
        ? { outcome: "deny", reason: "Hidden from this principal" }
        : { outcome: "allow", reason: "Visible to this principal" },
    );
    const sessionId = await initialize(handler);

    const response = await rpc(handler, sessionId, 2, "tools/list", {});

    expect(response).toMatchObject({
      result: {
        tools: [expect.objectContaining({ name: "sigil-test-visible" })],
      },
    });
    expect(JSON.stringify(response)).not.toContain("sigil-test-hidden");
    expect(JSON.stringify(response)).not.toContain(
      "Sensitive hidden description",
    );

    const hiddenCall = await rpc(handler, sessionId, 3, "tools/call", {
      name: "sigil-test-hidden",
      arguments: {},
    });
    const missingCall = await rpc(handler, sessionId, 3, "tools/call", {
      name: "sigil-test-missing",
      arguments: {},
    });
    expect(hiddenCall).toMatchObject({
      result: {
        isError: true,
        content: [{ type: "text", text: "Unknown tool: sigil-test-hidden" }],
      },
    });
    const normalizeRequestedName = (value: unknown) =>
      JSON.stringify(value)
        .replaceAll("sigil-test-hidden", "<requested-tool>")
        .replaceAll("sigil-test-missing", "<requested-tool>");
    expect(normalizeRequestedName(hiddenCall)).toBe(
      normalizeRequestedName(missingCall),
    );
    expect(JSON.stringify(hiddenCall)).not.toContain(
      "Sensitive hidden description",
    );
    expect(hiddenExecuted).toBe(false);
  });

  it("denies orchestrator pin mutations without changing pending state", async () => {
    const registry = new ToolRegistry({
      security: {
        approvalProvider: {
          decide: () => ({ outcome: "approved" }),
        },
      },
    });
    registry.register({
      name: "sigil-test-payload",
      description: "On-demand tool used as a pin target.",
      visibility: "on-demand",
      approval: "read",
      input: passthrough(),
      handler: async () => ({ data: { ok: true } }),
    });
    const orchestrator = createOrchestrator({
      registries: [registry],
      scope: "mcp",
    });
    const handler = webHandler(orchestrator, ({ request }) =>
      request.action === "tool.invoke" &&
      request.resource.target === "load_tool"
        ? { outcome: "deny", reason: "Pin mutation denied" }
        : { outcome: "allow", reason: "Allowed for test" },
    );
    const sessionId = await initialize(handler);

    const response = await rpc(handler, sessionId, 2, "tools/call", {
      name: "load_tool",
      arguments: { name: "sigil-test-payload" },
    });

    expect(response).toMatchObject({
      result: {
        isError: true,
        structuredContent: {
          error: {
            code: "AUTHORIZATION_DENIED",
            message: "Pin mutation denied",
          },
        },
      },
    });
    expect(orchestrator.pendingPins()).toEqual({ add: [], remove: [] });
    expect(orchestrator.committedPins()).toEqual([]);
  });
});
