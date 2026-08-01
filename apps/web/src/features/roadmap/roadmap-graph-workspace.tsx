"use client"

// Roadmap → Graph: loads the same stories the board loads and hands them to
// the dependency canvas. The read model is the existing `useStories` query —
// deliberately not a second loader, so board and graph can never disagree
// about what the roadmap contains.

import { useNavigate } from "@tanstack/react-router"

import { useStories } from "@/lib/work-items"

import { RoadmapGraphView } from "./roadmap-graph-view"
import type { RoadmapGraphStory } from "./roadmap-graph"

export function RoadmapGraphWorkspace({
  initialStoryId,
}: {
  initialStoryId?: string
}) {
  const navigate = useNavigate({ from: "/roadmap" })
  const stories = useStories()

  if (stories.isPending) {
    return (
      <p className="p-4 text-xs text-muted-foreground">Loading roadmap…</p>
    )
  }
  if (stories.isError) {
    return (
      <p className="p-4 text-xs text-destructive">
        The roadmap store did not answer. The dependency graph is unavailable
        until it does.
      </p>
    )
  }

  const graphStories: RoadmapGraphStory[] = (stories.data ?? []).map(
    (story) => ({
      id: story.id,
      title: story.title,
      status: story.status,
      epicId: story.epicId,
      epicTitle: story.epicTitle,
      deps: story.deps,
      ...(story.worktree ? { worktree: story.worktree } : {}),
      ...(story.assignee ? { assignee: story.assignee } : {}),
    }),
  )

  if (graphStories.length === 0) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        No stories in the roadmap store yet — the graph appears once stories
        with <code className="font-mono">deps</code> exist.
      </p>
    )
  }

  return (
    <RoadmapGraphView
      stories={graphStories}
      initialStoryId={initialStoryId}
      onSelectStory={(storyId) =>
        // `replace` so tracing a chain doesn't bury the board under a dozen
        // history entries; the canvas owns the selection, the URL just records
        // it so a reload lands back on the same story.
        void navigate({
          search: storyId
            ? { view: "graph" as const, story: storyId }
            : { view: "graph" as const },
          replace: true,
        })
      }
    />
  )
}
