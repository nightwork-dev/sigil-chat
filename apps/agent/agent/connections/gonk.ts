import { defineMcpClientConnection } from "eve/connections";

const token = process.env.GONK_MCP_KEY;

export default defineMcpClientConnection({
  url: process.env.GONK_MCP_URL ?? "http://sigil-chat-gonk.localhost:1355/mcp",
  description:
    "Application tools generated and governed by the Gonk registry. Includes graph editing, LiveOps review inspection and annotations, and semantic UI highlighting. Prefer batched tools for related changes so they use one approval and land together.",
  // This preference is client-declared, not verified, and not a security boundary.
  approval: ({ session }) =>
    session.auth.current?.attributes.sigilToolApproval === "always"
      ? "not-applicable"
      : "user-approval",
  ...(token
    ? {
        auth: {
          getToken: async () => ({ token }),
        },
      }
    : {}),
});
