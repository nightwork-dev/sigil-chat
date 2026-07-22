import type { Story } from "@workspace/work-items-store/types"

export type StoryRelationship = "active" | "prerequisite" | "dependent" | "unrelated"

export interface StoryRelationshipSet {
  activeId: string | null
  prerequisites: Set<string>
  dependents: Set<string>
}

export function storyRelationships(
  stories: Story[],
  activeId: string | null,
): StoryRelationshipSet {
  if (!activeId) {
    return { activeId: null, prerequisites: new Set(), dependents: new Set() }
  }

  const activeStory = stories.find((story) => story.id === activeId)
  if (!activeStory) {
    return { activeId: null, prerequisites: new Set(), dependents: new Set() }
  }

  return {
    activeId,
    prerequisites: new Set(activeStory.deps),
    dependents: new Set(
      stories.filter((story) => story.deps.includes(activeId)).map((story) => story.id),
    ),
  }
}

export function relationshipForStory(
  relationships: StoryRelationshipSet,
  storyId: string,
): StoryRelationship {
  if (relationships.activeId === storyId) return "active"
  if (relationships.prerequisites.has(storyId)) return "prerequisite"
  if (relationships.dependents.has(storyId)) return "dependent"
  return "unrelated"
}
