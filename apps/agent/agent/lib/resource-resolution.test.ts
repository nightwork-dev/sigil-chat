import { describe, expect, it } from "vitest"

import { resolveScopedResources } from "./resource-resolution"

describe("resolveScopedResources", () => {
  it("unions mounts by stable identity and preserves one canonical home", () => {
    const resolved = resolveScopedResources({
      viewScopeIds: ["project-a", "project-b"],
      resources: [
        {
          resourceId: "artifact-1",
          homeScopeId: "workspace-home",
          mountedScopeIds: ["project-a"],
          value: { title: "Launch brief" },
        },
        {
          resourceId: "artifact-1",
          homeScopeId: "workspace-home",
          mountedScopeIds: ["project-b"],
          value: { title: "Launch brief" },
        },
      ],
      canRead: () => true,
    })

    expect(resolved).toEqual([
      expect.objectContaining({
        resourceId: "artifact-1",
        homeScopeId: "workspace-home",
        mountedScopeIds: ["project-a", "project-b"],
        matchedScopeIds: ["project-a", "project-b"],
      }),
    ])
  })

  it("removing a mount removes only that view projection", () => {
    const resource = {
      resourceId: "artifact-1",
      homeScopeId: "workspace-home",
      mountedScopeIds: [] as string[],
      value: { title: "Launch brief" },
    }

    expect(
      resolveScopedResources({
        viewScopeIds: ["workspace-home"],
        resources: [resource],
        canRead: () => true,
      }),
    ).toHaveLength(1)
    expect(
      resolveScopedResources({
        viewScopeIds: ["project-a"],
        resources: [resource],
        canRead: () => true,
      }),
    ).toEqual([])
  })

  it("does not disclose mounts outside the authorized view", () => {
    const [resolved] = resolveScopedResources({
      viewScopeIds: ["project-a"],
      resources: [
        {
          resourceId: "artifact-1",
          homeScopeId: "workspace-home",
          mountedScopeIds: ["project-a", "project-hidden"],
          value: null,
        },
      ],
      canRead: () => true,
    })

    expect(resolved?.mountedScopeIds).toEqual(["project-a"])
    expect(JSON.stringify(resolved)).not.toContain("project-hidden")
  })

  it("reauthorizes the canonical resource on every resolution", () => {
    let allowed = true
    const resource = {
      resourceId: "artifact-1",
      homeScopeId: "workspace-home",
      mountedScopeIds: ["project-a"],
      value: null,
    }
    const resolve = () =>
      resolveScopedResources({
        viewScopeIds: ["project-a"],
        resources: [resource],
        canRead: () => allowed,
      })

    expect(resolve()).toHaveLength(1)
    allowed = false
    expect(resolve()).toEqual([])
  })

  it("rejects one identity with conflicting canonical homes", () => {
    expect(() =>
      resolveScopedResources({
        viewScopeIds: ["project-a"],
        resources: [
          {
            resourceId: "artifact-1",
            homeScopeId: "workspace-a",
            mountedScopeIds: ["project-a"],
            value: null,
          },
          {
            resourceId: "artifact-1",
            homeScopeId: "workspace-b",
            mountedScopeIds: ["project-a"],
            value: null,
          },
        ],
        canRead: () => true,
      }),
    ).toThrow("conflicting canonical homes")
  })
})
