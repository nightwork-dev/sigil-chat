import { createServer } from "node:http";
import {
  type AuthContext,
  type AuthenticatedPrincipal,
  isAuthenticatedPrincipal,
} from "@gonk/auth";
import { GONK_AUTH_INFO_PRINCIPAL } from "@gonk/tool-registry-mcp";
import { checkBearer, createWebMcpHandler } from "@gonk/tool-registry-mcp/http";
import { createFixtureRegistry } from "./registry.js";

const port = Number(process.env.PORT ?? 4317);
const apiKey = process.env.GONK_MCP_KEY;

if (!apiKey) throw new Error("GONK_MCP_KEY is required");

const principal: AuthenticatedPrincipal = {
  id: "service:sigil-external-consumer-fixture",
  kind: "service",
  identity: {
    issuer: "sigil-external-consumer-fixture",
    subject: "sigil-external-consumer-fixture",
    method: "api-key",
  },
  roles: ["service"],
  scopes: ["fixture:mcp"],
};

const handler = createWebMcpHandler({
  source: createFixtureRegistry(),
  serverName: "sigil-external-consumer-fixture",
  serverVersion: "0.0.0",
  authenticate: (request) => {
    if (!checkBearer(request.headers.get("authorization") ?? undefined, apiKey))
      return null;
    return {
      token: apiKey,
      clientId: principal.id,
      scopes: [...principal.scopes],
      extra: { [GONK_AUTH_INFO_PRINCIPAL]: principal },
    };
  },
  makeAuthContext: (extra): AuthContext => {
    const authenticated =
      extra.http?.authInfo?.extra?.[GONK_AUTH_INFO_PRINCIPAL];
    if (!isAuthenticatedPrincipal(authenticated)) {
      throw new Error("Gonk MCP principal is required");
    }
    return {
      principal: authenticated,
      authorize: () => ({
        outcome: "allow",
        reason: "Fixture service bearer",
      }),
    };
  },
  enableJsonResponse: true,
  writeToolPolicy: "permissive",
});

createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value))
      value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const request = new Request(
    `http://127.0.0.1:${port}${incoming.url ?? "/mcp"}`,
    {
      method: incoming.method,
      headers,
      body: body.length === 0 ? undefined : body,
    },
  );
  const response = await handler.handle(request);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, "127.0.0.1");
