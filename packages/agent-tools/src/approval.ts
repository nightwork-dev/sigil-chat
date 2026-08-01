import type { ApprovalProvider } from "@gonk/tool-registry"

export const sigilApprovalProvider: ApprovalProvider = {
  decide: ({ approval, tool }) =>
    approval.tier === "exec" && tool.name !== "image_generate"
      ? {
          outcome: "denied",
          reason: "Sigil Chat does not permit executable application tools",
        }
      : {
          outcome: "approved",
          reason:
            tool.name === "image_generate"
              ? "Sigil Chat permits the enumerated portable image capability"
              : `Sigil Chat permits ${approval.tier} application tools`,
        },
}
