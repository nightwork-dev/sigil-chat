import { describe, expect, it } from "vitest"

import {
  authorizeToolInvocation,
  resolveToolState,
  type ScopedToolAttachment,
} from "./tool-resolution"

const nearestScopeWins = {
  resolveEnablement: (attachments: readonly ScopedToolAttachment[]) =>
    attachments.at(-1)?.enabled ?? false,
  resolveConfiguration: (attachments: readonly ScopedToolAttachment[]) =>
    [...attachments]
      .reverse()
      .find((entry) => entry.configuration !== undefined)?.configuration,
}

describe("resolveToolState", () => {
  it("keeps catalog, enablement, configuration, approval, and authorization distinct", () => {
    const state = resolveToolState({
      toolId: "sigil-publish",
      registeredToolIds: ["sigil-publish"],
      candidateScopeIds: ["project-a"],
      attachments: [
        {
          toolId: "sigil-publish",
          scopeId: "project-a",
          enabled: true,
          configuration: { channel: "preview" },
        },
      ],
      clientApproval: "pending",
      policy: nearestScopeWins,
    })

    expect(state).toMatchObject({
      registered: true,
      visible: true,
      enabled: true,
      configuration: { channel: "preview" },
      clientApproval: "pending",
      invocationAuthorized: undefined,
      invokable: undefined,
    })
  })

  it("authorizes the real operation only at invocation time", () => {
    const state = resolveToolState({
      toolId: "sigil-publish",
      registeredToolIds: ["sigil-publish"],
      candidateScopeIds: ["workspace-a"],
      attachments: [
        {
          toolId: "sigil-publish",
          scopeId: "workspace-a",
          enabled: true,
        },
      ],
      clientApproval: "approved",
      policy: nearestScopeWins,
    })
    const request = {
      operation: "publish",
      resourceTargets: ["artifact:launch"],
    }

    expect(
      authorizeToolInvocation({ state, request, authorize: () => false })
        .invokable,
    ).toBe(false)
    expect(
      authorizeToolInvocation({ state, request, authorize: () => true })
        .invokable,
    ).toBe(true)
  })

  it("reauthorizes invocation on every attempt", () => {
    let allowed = true
    const state = resolveToolState({
      toolId: "sigil-read",
      registeredToolIds: ["sigil-read"],
      candidateScopeIds: ["workspace-a"],
      attachments: [
        {
          toolId: "sigil-read",
          scopeId: "workspace-a",
          enabled: true,
        },
      ],
      clientApproval: "not-required",
      policy: nearestScopeWins,
    })
    const resolve = () =>
      authorizeToolInvocation({
        state,
        request: { operation: "read", resourceTargets: ["document:launch"] },
        authorize: () => allowed,
      })

    expect(resolve().invokable).toBe(true)
    allowed = false
    expect(resolve().invokable).toBe(false)
  })

  it("lets each tool define enablement precedence", () => {
    const state = resolveToolState({
      toolId: "sigil-read",
      registeredToolIds: ["sigil-read"],
      candidateScopeIds: ["project-a", "workspace-a"],
      attachments: [
        { toolId: "sigil-read", scopeId: "project-a", enabled: true },
        { toolId: "sigil-read", scopeId: "workspace-a", enabled: false },
      ],
      clientApproval: "not-required",
      policy: nearestScopeWins,
    })

    expect(state.enabled).toBe(false)
  })
})
