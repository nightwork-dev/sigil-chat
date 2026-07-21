import { describe, expect, it } from "vitest"

import { resolveAgentReach } from "./agent-reach-policy"
import type { ScopeLink } from "./scope-graph"

const links: ScopeLink[] = [
  {
    id: "workspace-in-project",
    kind: "mounted-in",
    subjectScopeId: "workspace-1",
    targetScopeId: "project-1",
    order: 0,
    createdAt: "2026-07-21T00:00:00.000Z",
    createdBy: "owner-1",
    revision: 1,
  },
  {
    id: "unrelated-discovery-link",
    kind: "discoverable-from",
    subjectScopeId: "workspace-2",
    targetScopeId: "project-1",
    order: 0,
    createdAt: "2026-07-21T00:00:00.000Z",
    createdBy: "owner-1",
    revision: 1,
  },
]

const candidates = [
  {
    id: "project-doc",
    homeScopeId: "project-1",
    homeScopeKind: "project" as const,
  },
  {
    id: "workspace-doc",
    homeScopeId: "workspace-1",
    homeScopeKind: "workspace" as const,
  },
  {
    id: "unrelated-doc",
    homeScopeId: "workspace-2",
    homeScopeKind: "workspace" as const,
  },
]

describe("resolveAgentReach", () => {
  it("uses only declared composition links and current authorization", () => {
    const resolved = resolveAgentReach({
      policy: {
        kind: "scope",
        homeScopeId: "project-1",
        homeScopeKind: "project",
        compositionLinkKinds: ["mounted-in"],
        descendantScopeKinds: ["workspace"],
      },
      candidates,
      links,
      authorization: {
        canDiscover: () => true,
        canRead: () => true,
      },
    })

    expect(resolved.candidateScopeIds).toEqual(["project-1", "workspace-1"])
    expect(resolved.discoverable.map((candidate) => candidate.id)).toEqual([
      "project-doc",
      "workspace-doc",
    ])
    expect(resolved.readable.map((candidate) => candidate.id)).toEqual([
      "project-doc",
      "workspace-doc",
    ])
  })

  it("applies a revoked grant immediately on the next resolve", () => {
    const input = {
      policy: {
        kind: "principal" as const,
      },
      candidates,
      authorization: {
        canDiscover: () => true,
        canRead: (candidate: (typeof candidates)[number]) =>
          candidate.id !== "workspace-doc",
      },
    }

    const beforeRevocation = resolveAgentReach({
      ...input,
      authorization: { canDiscover: () => true, canRead: () => true },
    })
    const afterRevocation = resolveAgentReach(input)

    expect(beforeRevocation.readable.map((candidate) => candidate.id)).toEqual([
      "project-doc",
      "unrelated-doc",
      "workspace-doc",
    ])
    expect(afterRevocation.readable.map((candidate) => candidate.id)).toEqual([
      "project-doc",
      "unrelated-doc",
    ])
  })
})
