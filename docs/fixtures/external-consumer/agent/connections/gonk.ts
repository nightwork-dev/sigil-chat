import { defineMcpClientConnection } from "eve/connections";

const url = process.env.GONK_MCP_URL ?? "http://127.0.0.1:4317/mcp";
const token = process.env.GONK_MCP_KEY;

if (!token) throw new Error("GONK_MCP_KEY is required");

export default defineMcpClientConnection({
  url,
  description: "Fixture-owned application tools exposed through Gonk MCP.",
  approval: () => "not-applicable",
  auth: { getToken: async () => ({ token }) },
});
