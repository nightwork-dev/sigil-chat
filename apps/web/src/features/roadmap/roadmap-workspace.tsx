"use client"

import { useState } from "react"
import {
  CheckIcon,
  InboxIcon,
  LayoutListIcon,
  PencilLineIcon,
  SendHorizonalIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAssignReview,
  useDecideReview,
  useReviews,
  useStories,
  useTransitionStory,
  useUpsertStory,
} from "@/lib/work-items"
import {
  isDavidGate,
  Story,
  STORY_STATUS,
  STORY_STATUS_ORDER,
} from "@/components/roadmap/story"
import type {
  ReviewDecision,
  ReviewItem,
  Story as StoryData,
  StoryStatus,
} from "@workspace/work-items-store/types"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

type AsidePane = "queue" | "detail"

function groupByStatus(stories: StoryData[]): Record<StoryStatus, StoryData[]> {
  const groups = Object.fromEntries(
    STORY_STATUS_ORDER.map((status) => [status, [] as StoryData[]]),
  ) as Record<StoryStatus, StoryData[]>
  for (const story of stories) groups[story.status]?.push(story)
  return groups
}

// Pending (uncompleted) reviews first, each set newest-first — David works the
// top of the queue and the completed decisions settle beneath it.
function orderReviews(reviews: ReviewItem[]): ReviewItem[] {
  return [...reviews].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function RoadmapWorkspace() {
  const stories = useStories()
  const reviews = useReviews()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pane, setPane] = useState<AsidePane>("queue")

  const allStories = stories.data ?? []
  const grouped = groupByStatus(allStories)
  const davidReviews = orderReviews(
    (reviews.data ?? []).filter((review) => review.assignee === "David"),
  )
  const pendingCount = davidReviews.filter((review) => !review.completed).length
  const selectedStory = allStories.find((story) => story.id === selectedId) ?? null
  const storiesById = new Map(allStories.map((story) => [story.id, story]))

  const openDetail = (id: string) => {
    setSelectedId(id)
    setPane("detail")
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-background lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Story board" className="min-h-0 overflow-hidden">
        {stories.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading the roadmap…</p>
        ) : stories.error ? (
          <p className="p-4 text-sm text-destructive">Could not load the roadmap.</p>
        ) : allStories.length === 0 ? (
          <Empty className="m-4 border">
            <EmptyHeader>
              <EmptyTitle>No stories yet</EmptyTitle>
              <EmptyDescription>
                The work-items store seeds the roadmap on first read.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex h-full gap-3 overflow-x-auto p-3">
            {STORY_STATUS_ORDER.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                stories={grouped[status]}
                selectedId={selectedId}
                onSelect={openDetail}
              />
            ))}
          </div>
        )}
      </section>

      <aside className="hidden min-h-0 flex-col border-l border-border bg-card/20 lg:flex">
        <div className="flex items-center gap-1 border-b border-border p-2">
          <Button
            size="sm"
            variant={pane === "queue" ? "secondary" : "ghost"}
            aria-pressed={pane === "queue"}
            onClick={() => setPane("queue")}
          >
            <InboxIcon />
            Review queue
            {pendingCount > 0 ? (
              <Badge className="ml-1 h-4 min-w-4 px-1 font-mono text-[0.5625rem]">
                {pendingCount}
              </Badge>
            ) : null}
          </Button>
          <Button
            size="sm"
            variant={pane === "detail" ? "secondary" : "ghost"}
            aria-pressed={pane === "detail"}
            onClick={() => setPane("detail")}
          >
            <LayoutListIcon />
            Story
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {pane === "queue" ? (
            <ReviewQueue reviews={davidReviews} storiesById={storiesById} onOpenStory={openDetail} />
          ) : selectedStory ? (
            <StoryDetail
              key={selectedStory.id}
              story={selectedStory}
              pendingReview={davidReviews.some(
                (review) => review.storyId === selectedStory.id && !review.completed,
              )}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              Select a story on the board to edit it here.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

function BoardColumn({
  status,
  stories,
  selectedId,
  onSelect,
}: {
  status: StoryStatus
  stories: StoryData[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const meta = STORY_STATUS[status]
  return (
    <div className="flex h-full w-72 shrink-0 flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-xs font-medium">{meta.label}</span>
        <span className="font-mono text-[0.625rem] text-muted-foreground">{stories.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2">
        {stories.length === 0 ? (
          <p className="px-1 text-[0.625rem] text-muted-foreground/70">Empty</p>
        ) : (
          stories.map((story) => (
            <BoardCard
              key={story.id}
              story={story}
              selected={story.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}

function BoardCard({
  story,
  selected,
  onSelect,
}: {
  story: StoryData
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <Story.Root story={story}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(story.id)}
        className={cn(
          "flex w-full flex-col gap-2 rounded-md border bg-card p-3 text-left transition-colors hover:border-border/80 hover:bg-muted/40",
          selected ? "border-primary ring-1 ring-primary/30" : "border-border",
        )}
      >
        <Story.Title className="text-sm" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Story.RoutingBadge />
        </div>
        <Story.Meta />
      </button>
    </Story.Root>
  )
}

function ReviewQueue({
  reviews,
  storiesById,
  onOpenStory,
}: {
  reviews: ReviewItem[]
  storiesById: Map<string, StoryData>
  onOpenStory: (id: string) => void
}) {
  if (reviews.length === 0) {
    return (
      <Empty className="m-4 border">
        <EmptyHeader>
          <EmptyTitle>Queue is clear</EmptyTitle>
          <EmptyDescription>
            Reviews assigned to David appear here. Open a David-gated story and send it
            to your queue, or let the agent assign one.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="space-y-2 p-3">
      {reviews.map((review) => {
        const story = storiesById.get(review.storyId)
        if (!story) return null
        return (
          <ReviewQueueRow
            key={review.id}
            review={review}
            story={story}
            onOpenStory={onOpenStory}
          />
        )
      })}
    </div>
  )
}

function decisionBadge(decision: ReviewDecision | undefined) {
  if (decision === "approved")
    return (
      <Badge variant="outline" className="border-transparent bg-success/15 text-success">
        <CheckIcon />
        Approved
      </Badge>
    )
  if (decision === "changes-requested")
    return (
      <Badge variant="outline" className="border-transparent bg-warning/15 text-warning">
        <XIcon />
        Changes requested
      </Badge>
    )
  return null
}

function ReviewQueueRow({
  review,
  story,
  onOpenStory,
}: {
  review: ReviewItem
  story: StoryData
  onOpenStory: (id: string) => void
}) {
  const decide = useDecideReview()
  const act = (decision: ReviewDecision) =>
    decide
      .mutateAsync({ reviewId: review.id, decision })
      .then(() =>
        toast.success(
          decision === "approved" ? "Review approved" : "Changes requested",
        ),
      )
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not record decision"),
      )

  return (
    <Story.Root
      story={story}
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card p-3",
        review.completed ? "border-border opacity-80" : "border-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenStory(story.id)}
          className="min-w-0 text-left"
        >
          <Story.Title className="text-sm underline-offset-4 hover:underline" />
        </button>
        <Story.Status className="shrink-0" />
      </div>
      {review.summary ? (
        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{review.summary}</p>
      ) : null}
      <Story.Meta />
      {review.completed ? (
        <div className="flex items-center gap-2">{decisionBadge(review.decision)}</div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="xs" disabled={decide.isPending} onClick={() => act("approved")}>
            <CheckIcon />
            Approve
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={decide.isPending}
            onClick={() => act("changes-requested")}
          >
            <XIcon />
            Request changes
          </Button>
          {decide.error ? (
            <span className="text-[0.625rem] text-destructive">{decide.error.message}</span>
          ) : null}
        </div>
      )}
    </Story.Root>
  )
}

function StoryDetail({ story, pendingReview }: { story: StoryData; pendingReview: boolean }) {
  const upsert = useUpsertStory()
  const transition = useTransitionStory()
  const assign = useAssignReview()
  const [title, setTitle] = useState(story.title)
  const [intent, setIntent] = useState(story.intent)

  const dirty = title.trim() !== story.title || intent.trim() !== story.intent
  const canSave = dirty && title.trim().length > 0 && !upsert.isPending

  const save = () =>
    upsert
      .mutateAsync({ story: { ...story, title: title.trim(), intent: intent.trim() } })
      .then(() => toast.success("Story saved"))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not save story"),
      )

  const move = (status: StoryStatus) =>
    transition
      .mutateAsync({ id: story.id, status })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not move story"),
      )

  const requestReview = () =>
    assign
      .mutateAsync({ id: story.id, gate: story.reviewGate })
      .then(() => toast.success("Sent to David's review queue"))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not assign review"),
      )

  return (
    <Story.Root story={story} className="flex flex-col gap-5 p-4">
      <div className="flex items-center justify-between gap-2">
        <Story.Meta />
        <Story.RoutingBadge />
      </div>

      <div className="space-y-1.5">
        <label className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Title
        </label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Story title" />
      </div>

      <div className="space-y-1.5">
        <label className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Intent
        </label>
        <Textarea
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          aria-label="Story intent"
          className="min-h-24"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!canSave} onClick={save}>
          <PencilLineIcon />
          Save changes
        </Button>
        {dirty ? (
          <span className="text-[0.625rem] text-muted-foreground">Unsaved edits</span>
        ) : null}
      </div>

      <div className="space-y-1.5 border-t border-border pt-4">
        <label className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Status
        </label>
        <Select
          value={story.status}
          onValueChange={(value) => void move(value as StoryStatus)}
          disabled={transition.isPending}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STORY_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {STORY_STATUS[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <span className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Acceptance criteria
        </span>
        <Story.AcceptanceList />
      </div>

      {story.deps.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-4">
          <span className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Depends on
          </span>
          <div className="flex flex-wrap gap-1.5">
            {story.deps.map((dep) => (
              <Badge key={dep} variant="outline" className="font-mono">
                {dep}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {isDavidGate(story.reviewGate) && !pendingReview ? (
        <div className="border-t border-border pt-4">
          <Button size="sm" variant="outline" disabled={assign.isPending} onClick={requestReview}>
            <SendHorizonalIcon />
            Send to review queue
          </Button>
        </div>
      ) : null}
    </Story.Root>
  )
}
