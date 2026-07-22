import { defineMcpClientConnection } from "eve/connections";
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation";
import { readGonkClientEnvironment } from "@workspace/runtime-env/server";
import { toolApprovalModeFor } from "../lib/tool-approval-preference";

const { apiKey: token, gonkMcpUrl } = readGonkClientEnvironment(process.env);

export default defineMcpClientConnection({
  url: gonkMcpUrl,
  description:
    "Application tools generated and governed by the Gonk registry. Includes graph editing, article review inspection and annotations, and semantic UI highlighting. Prefer batched tools for related changes so they use one approval and land together.",
  // This preference is client-declared, not verified, and not a security boundary.
  approval: ({ session, toolName }) =>
    toolApprovalModeFor(
      session.auth.current?.attributes.sigilToolApproval,
      toolName,
    ) === "always"
      ? "not-applicable"
      : "user-approval",
  headers: ({ session }): Readonly<Record<string, string>> => {
    const resourceScope =
      session.auth.current?.attributes.sigilResourceScope ??
      session.auth.current?.attributes.sigilSessionScope
    const scopeProof = session.auth.current?.attributes.sigilScopeProof
    if (typeof resourceScope !== "string" || resourceScope.length === 0) {
      return {}
    }
    return {
      "x-sigil-scope": resourceScope,
      ...(typeof scopeProof === "string" && scopeProof.length > 0
        ? { [AGENT_SCOPE_PROOF_HEADER]: scopeProof }
        : {}),
    }
  },
  ...(token
    ? {
        auth: {
          getToken: async () => ({ token }),
        },
      }
    : {}),
});
