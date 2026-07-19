"use client"

import { useState } from "react"
import {
  CheckIcon,
  InboxIcon,
  LayoutListIcon,
  MessageSquareIcon,
  PencilLineIcon,
  SendHorizonalIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAddComment,
  useAssignReview,
  useDecideReview,
  useReviews,
  useStories,
  useStoryComments,
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
  StoryComment,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
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
  const isMobile = useIsMobile()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pane, setPane] = useState<AsidePane>("queue")
  const [sheetOpen, setSheetOpen] = useState(false)

  const allStories = stories.data ?? []
  const grouped = groupByStatus(allStories)
  const davidReviews = orderReviews(
    (reviews.data ?? []).filter((review) => review.assignee === "David"),
  )
  const pendingCount = davidReviews.filter((review) => !review.completed).length
  const selectedStory = allStories.find((story) => story.id === selectedId) ?? null
  const storiesById = new Map(allStories.map((story) => [story.id, story]))

  // On phones the aside is a sheet; opening a story or the queue drives it.
  // On ≥md the aside is inline and `sheetOpen` is inert.
  const openDetail = (id: string) => {
    setSelectedId(id)
    setPane("detail")
    setSheetOpen(true)
  }
  const openQueue = () => {
    setPane("queue")
    setSheetOpen(true)
  }

  const paneBody = (
    <AsidePaneBody
      pane={pane}
      setPane={setPane}
      pendingCount={pendingCount}
      davidReviews={davidReviews}
      storiesById={storiesById}
      selectedStory={selectedStory}
      onOpenStory={openDetail}
    />
  )

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] grid-cols-1 overflow-hidden bg-background md:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Story board" className="flex min-h-0 flex-col overflow-hidden">
        {/* Phone-only bar: the review queue / story detail live in a sheet here,
            so give a way to reach the queue without selecting a card first. */}
        <div className="flex items-center justify-end gap-2 border-b border-border px-3 py-2 md:hidden">
          <Button size="sm" variant="outline" onClick={openQueue}>
            <InboxIcon />
            Review queue
            {pendingCount > 0 ? (
              <Badge className="ml-1 h-4 min-w-4 px-1 font-mono text-[0.5625rem]">
                {pendingCount}
              </Badge>
            ) : null}
          </Button>
        </div>
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
          <div className="scroll-area flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 p-3">
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

      <aside className="hidden min-h-0 flex-col border-l border-border bg-card/20 md:flex">
        {!isMobile ? paneBody : null}
      </aside>

      {isMobile ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-[88%] max-w-sm flex-col gap-0 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Roadmap review</SheetTitle>
              <SheetDescription>Review queue and story detail</SheetDescription>
            </SheetHeader>
            {paneBody}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}

// The aside's tab bar + body (review queue | story detail). Rendered inline in
// the desktop aside and inside the phone sheet — one implementation, both homes.
function AsidePaneBody({
  pane,
  setPane,
  pendingCount,
  davidReviews,
  storiesById,
  selectedStory,
  onOpenStory,
}: {
  pane: AsidePane
  setPane: (pane: AsidePane) => void
  pendingCount: number
  davidReviews: ReviewItem[]
  storiesById: Map<string, StoryData>
  selectedStory: StoryData | null
  onOpenStory: (id: string) => void
}) {
  return (
    <>
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
      <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
        {pane === "queue" ? (
          <ReviewQueue reviews={davidReviews} storiesById={storiesById} onOpenStory={onOpenStory} />
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
    </>
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
    <div className="flex h-full w-[85vw] max-w-sm shrink-0 snap-start flex-col md:w-72 md:max-w-none">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-xs font-medium">{meta.label}</span>
        <span className="font-mono text-[0.625rem] text-muted-foreground">{stories.length}</span>
      </div>
      {/* px gives the selected card's focus ring breathing room (it was clipped
          on the left); .scroll-area reserves the scrollbar gutter so it doesn't
          sit flush against the cards' right edge. */}
      <div className="scroll-area min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 pt-0.5 pb-2">
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
      // Padded wrapper, not m-4 on the Empty itself: Empty is `w-full`, so a
      // horizontal margin makes it 100% + 32px and overflows off the right edge.
      <div className="p-4">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Queue is clear</EmptyTitle>
            <EmptyDescription>
              Reviews assigned to you appear here. Open a story that needs your
              review and send it to your queue, or let the agent assign one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
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
      .then(() => toast.success("Sent to your review queue"))
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

      <StoryComments story={story} />
    </Story.Root>
  )
}

// Persona addressees David can direct feedback at. Open-but-validated: an
// unknown value renders as-is rather than breaking (the roster grows).
const COMMENT_ADDRESSEES: { value: string; label: string }[] = [
  { value: "general", label: "Everyone" },
  { value: "garnet", label: "Garnet" },
  { value: "fable", label: "Fable" },
  { value: "codex", label: "codex" },
]

const COMMENT_KINDS: { value: StoryComment["kind"]; label: string }[] = [
  { value: "suggestion", label: "Suggestion" },
  { value: "question", label: "Question" },
  { value: "concern", label: "Concern" },
]

function addresseeLabel(addressee: string): string {
  return COMMENT_ADDRESSEES.find((a) => a.value === addressee)?.label ?? addressee
}

// In-app feedback ON a story (S1.7): the write-side of the review loop. A comment
// is domain data persisted on the story's own record (roadmap store), survives
// across worktrees/agents, and carries an addressee so David can direct a note at
// one of the coordinating agents from his phone. (@name comms delivery is slice 2.)
function StoryComments({ story }: { story: StoryData }) {
  const comments = useStoryComments(story.id)
  const addComment = useAddComment()
  const [body, setBody] = useState("")
  const [kind, setKind] = useState<StoryComment["kind"]>("suggestion")
  const [addressee, setAddressee] = useState("general")

  const thread = [...(comments.data ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  const canSend = body.trim().length > 0 && !addComment.isPending

  const send = () =>
    addComment
      .mutateAsync({
        storyId: story.id,
        kind,
        author: "David",
        body: body.trim(),
        addressee: addressee === "general" ? undefined : addressee,
      })
      .then(() => {
        setBody("")
        toast.success("Feedback added")
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not add feedback"),
      )

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-1.5">
        <MessageSquareIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Feedback
        </span>
        {thread.length > 0 ? (
          <span className="font-mono text-[0.625rem] text-muted-foreground">{thread.length}</span>
        ) : null}
      </div>

      {comments.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading feedback…</p>
      ) : thread.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No feedback yet — leave a note on this story below.
        </p>
      ) : (
        <ul className="space-y-2">
          {thread.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Leave feedback on this story…"
          aria-label="New feedback"
          className="min-h-20"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(value) => setKind(value as StoryComment["kind"])}>
            <SelectTrigger className="h-8 w-auto min-w-28" aria-label="Feedback kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMENT_KINDS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={addressee} onValueChange={(value) => setAddressee(value ?? "general")}>
            <SelectTrigger className="h-8 w-auto min-w-24" aria-label="Addressee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMENT_ADDRESSEES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.value === "general" ? option.label : `For ${option.label}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="ml-auto" disabled={!canSend} onClick={send}>
            <SendHorizonalIcon />
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

function CommentRow({ comment }: { comment: StoryComment }) {
  return (
    <li className="rounded-md border border-border bg-card/40 p-2.5 text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{comment.author}</span>
        <Badge variant="outline" className="h-4 px-1 text-[0.5625rem] capitalize">
          {comment.kind}
        </Badge>
        {comment.addressee ? (
          <Badge className="h-4 px-1 text-[0.5625rem]">→ {addresseeLabel(comment.addressee)}</Badge>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap leading-5 text-foreground/90">{comment.body}</p>
    </li>
  )
}
