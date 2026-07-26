import { describe, expect, it, vi } from "vitest"

import { createCapabilityManifestContext } from "./capability-manifest-context"

const identity = {
  principalId: "user-1",
  personaId: "sigil-chat-eve",
  applicationThreadId: "thread-1",
  activeScope: "personal-scope:user-1",
  readableContextScopes: ["project:atlas"],
}

describe("createCapabilityManifestContext", () => {
  it("renders the live registry's tools and the governing instruction", () => {
    const render = createCapabilityManifestContext({
      host: { id: "eve", label: "Eve", model: "gpt-x" },
      listTools: () => [
        { name: "sigil-review-add-annotation", description: "Attach feedback" },
      ],
      canMutate: () => true,
    })(identity)

    expect(render).toContain("sigil-review-add-annotation")
    expect(render).toContain("personal-scope:user-1")
    expect(render).toContain("project:atlas")
    expect(render).toContain("Do not claim a capability, tool, or scope")
  })

  it("A/B: a tool absent from the live registry is not claimed", () => {
    const build = (toolName: string) =>
      createCapabilityManifestContext({
        host: { id: "eve", label: "Eve" },
        listTools: () => [{ name: toolName }],
        canMutate: () => true,
      })(identity)

    expect(build("sigil-review-add-annotation")).toContain(
      "sigil-review-add-annotation",
    )
    expect(build("sigil-ui-highlight")).not.toContain(
      "sigil-review-add-annotation",
    )
  })

  it("checks mutation against the active scope and reports read-only", () => {
    const canMutate = vi.fn(() => false)
    const render = createCapabilityManifestContext({
      host: { id: "eve", label: "Eve" },
      listTools: () => [],
      canMutate,
    })(identity)

    expect(canMutate).toHaveBeenCalledWith("user-1", "personal-scope:user-1")
    expect(render).toContain("read-only")
  })
})
