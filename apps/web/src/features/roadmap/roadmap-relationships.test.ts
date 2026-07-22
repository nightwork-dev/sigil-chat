import { describe, expect, it } from "vitest"

import type { Story } from "@workspace/work-items-store/types"

import {
  relationshipForStory,
  storyRelationships,
  unresolvedPrerequisitesForStory,
} from "./roadmap-relationships"

function story(id: string, deps: string[] = [], status: Story["status"] = "ready"): Story {
  return { id, deps, status } as Story
}

describe("roadmap relationships", () => {
  it("finds direct prerequisites and dependents around the active story", () => {
    const relationships = storyRelationships(
      [story("A"), story("B", ["A"]), story("C", ["B"]), story("D", ["B"])],
      "B",
    )

    expect(relationshipForStory(relationships, "A")).toBe("prerequisite")
    expect(relationshipForStory(relationships, "B")).toBe("active")
    expect(relationshipForStory(relationships, "C")).toBe("dependent")
    expect(relationshipForStory(relationships, "D")).toBe("dependent")
  })

  it("does not highlight anything without a valid active story", () => {
    const relationships = storyRelationships([story("A")], "missing")

    expect(relationships.activeId).toBeNull()
    expect(relationshipForStory(relationships, "A")).toBe("unrelated")
  })

  it("treats prerequisites before verify, and missing prerequisites, as unresolved", () => {
    const stories = [
      story("idea", [], "idea"),
      story("active", [], "in-progress"),
      story("verify", [], "verify"),
      story("shipped", [], "shipped"),
    ]
    const storiesById = new Map(stories.map((item) => [item.id, item]))

    expect(
      unresolvedPrerequisitesForStory(
        storiesById,
        story("consumer", ["idea", "active", "verify", "shipped", "missing"]),
      ),
    ).toEqual(["idea", "active", "missing"])
  })
})
