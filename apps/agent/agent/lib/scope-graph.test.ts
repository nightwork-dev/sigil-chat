import { describe, expect, it } from "vitest"

import {
  traverseScopeLinks,
  type ScopeLink,
  wouldCreateScopeLinkCycle,
} from "./scope-graph"

function link(
  id: string,
  subjectScopeId: string,
  targetScopeId: string,
  order = 0,
): ScopeLink {
  return {
    id,
    kind: "mounted-in",
    subjectScopeId,
    targetScopeId,
    order,
    createdAt: "2026-07-21T00:00:00.000Z",
    createdBy: "user-1",
    revision: 1,
  }
}

describe("scope graph traversal", () => {
  it("uses relation-local order and de-duplicates a diamond", () => {
    const links = [
      link("a-to-root", "a", "root", 2),
      link("b-to-root", "b", "root", 1),
      link("leaf-to-a", "leaf", "a"),
      link("leaf-to-b", "leaf", "b"),
    ]

    expect(
      traverseScopeLinks({
        rootScopeId: "root",
        kind: "mounted-in",
        direction: "subjects",
        links,
      }),
    ).toEqual(["root", "b", "a", "leaf"])
  })

  it("does not follow a different relation", () => {
    const links = [
      link("workspace-to-project", "workspace", "project"),
      { ...link("unrelated", "other", "project"), kind: "rolls-up-to" as const },
    ]

    expect(
      traverseScopeLinks({
        rootScopeId: "project",
        kind: "mounted-in",
        direction: "subjects",
        links,
      }),
    ).toEqual(["project", "workspace"])
  })

  it("rejects an edge that would close a relation-local cycle", () => {
    const links = [link("a-to-b", "a", "b"), link("b-to-c", "b", "c")]

    expect(
      wouldCreateScopeLinkCycle(
        {
          kind: "mounted-in",
          subjectScopeId: "c",
          targetScopeId: "a",
        },
        links,
      ),
    ).toBe(true)
    expect(
      wouldCreateScopeLinkCycle(
        {
          kind: "rolls-up-to",
          subjectScopeId: "c",
          targetScopeId: "a",
        },
        links,
      ),
    ).toBe(false)
  })
})
