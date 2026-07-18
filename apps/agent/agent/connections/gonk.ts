import { defineMcpClientConnection } from "eve/connections";
import { readGonkClientEnvironment } from "@workspace/runtime-env/server";

const { apiKey: token, gonkMcpUrl } = readGonkClientEnvironment(process.env);

export default defineMcpClientConnection({
  url: gonkMcpUrl,
  description:
    "Application tools generated and governed by the Gonk registry. Includes graph editing, article review inspection and annotations, and semantic UI highlighting. Prefer batched tools for related changes so they use one approval and land together.",
  // This preference is client-declared, not verified, and not a security boundary.
  approval: ({ session }) =>
    session.auth.current?.attributes.sigilToolApproval === "always"
      ? "not-applicable"
      : "user-approval",
  headers: ({ session }): Readonly<Record<string, string>> => {
    const sessionScope = session.auth.current?.attributes.sigilSessionScope
    if (typeof sessionScope !== "string" || sessionScope.length === 0) {
      return {}
    }
    return { "x-sigil-session-id": sessionScope }
  },
  ...(token
    ? {
        auth: {
          getToken: async () => ({ token }),
        },
      }
    : {}),
});
