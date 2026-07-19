import { createServer } from "node:http";
import { createAgentWebMcpHandler } from "@zigil/agent-gonk";
import { createFixtureRegistry } from "./registry.js";

const port = Number(process.env.PORT ?? 4317);
const apiKey = process.env.GONK_MCP_KEY;

if (!apiKey) throw new Error("GONK_MCP_KEY is required");

const handler = createAgentWebMcpHandler({
  source: createFixtureRegistry(),
  serverName: "sigil-external-consumer-fixture",
  serverVersion: "0.0.0",
  apiKey,
  authorize: () => ({ outcome: "allow", reason: "Fixture service bearer" }),
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
