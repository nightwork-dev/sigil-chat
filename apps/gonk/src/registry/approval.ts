import type { ApprovalProvider } from "@gonk/tool-registry";

export const sigilApprovalProvider: ApprovalProvider = {
  decide: ({ approval }) =>
    approval.tier === "exec"
      ? {
          outcome: "denied",
          reason: "Sigil Chat does not permit executable MCP tools",
        }
      : {
          outcome: "approved",
          reason: `Sigil Chat permits ${approval.tier} application tools`,
        },
};
