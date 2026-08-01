// VQ.1 — the owner's verification queue, in the app.
//
// Mounted once in the _app shell so the queue is reachable from whatever
// surface the owner is standing on, which is the point: the stories in it are
// checked by USING the app, and walking back to a board to tick a box is the
// friction this removes. Collapsed it is a count chip and nothing else;
// expanded it is the pile, newest-first, each row carrying the walk-through
// and the two acts that close it out.
//
// Registry loop (step 0, consumed): the panel chrome is @workspace/ui's
// FloatingDock — the same primitive the agent HUD is built on — and the rows
// compose the existing roadmap Story compound component. Nothing here is a new
// presentation primitive; what is app-domain is which stories belong in the
// pile and what checking one off means.
//
// Bottom-LEFT on purpose: the agent HUD owns bottom-right in this shell.

import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowRightIcon, CheckIcon, MessageSquareIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { FloatingDock } from "@workspace/ui/components/floating-dock"
import { Textarea } from "@workspace/ui/components/textarea"

import { Story } from "@/components/roadmap/story"
import { useAddComment, useStories } from "@/lib/work-items"
import {
  selectVerificationQueue,
  useVerificationPass,
  useVerificationQueueAccess,
  type VerificationQueueEntry,
} from "@/lib/verification-queue"

export function VerificationQueueOverlay() {
  const access = useVerificationQueueAccess()
  // Not a styling choice — the queue's data hooks live in the inner component
  // so a member or a flagged-off installation never issues the roadmap read
  // at all, rather than fetching it and hiding the result.
  if (!access.data?.enabled) return null
  return <VerificationQueue />
}

function VerificationQueue() {
  const stories = useStories({ status: "verify" })
  const [open, setOpen] = useState(false)
  const entries = selectVerificationQueue(stories.data ?? [])

  // Nothing waiting is worth no chrome at all — an empty quest log is noise.
  if (entries.length === 0) return null

  return (
    <FloatingDock.Root
      className="fixed bottom-4 left-4 z-30 justify-items-start max-sm:right-2 max-sm:bottom-2 max-sm:left-2"
      onOpenChange={setOpen}
      open={open}
      panelId="verification-queue"
    >
      <FloatingDock.Trigger
        aria-label={`Open the verification queue — ${entries.length} waiting`}
        className="justify-self-start max-sm:min-h-11"
        size="sm"
        variant="outline"
      >
        <span className="font-mono tabular-nums">{entries.length}</span>
        <span className="text-muted-foreground">to verify</span>
      </FloatingDock.Trigger>

      <FloatingDock.Panel
        heading="Verification queue"
        description="Stories waiting on your browser pass"
      >
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.story.id}>
              <QueueRow entry={entry} onNavigate={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      </FloatingDock.Panel>
    </FloatingDock.Root>
  )
}

function QueueRow({
  entry,
  onNavigate,
}: {
  entry: VerificationQueueEntry
  onNavigate: () => void
}) {
  const navigate = useNavigate()
  const pass = useVerificationPass()
  const addComment = useAddComment()
  const [feedback, setFeedback] = useState<string | null>(null)
  const draft = feedback ?? ""
  const busy = pass.isPending || addComment.isPending

  function submitFeedback() {
    const body = draft.trim()
    if (body.length === 0) return
    addComment.mutate(
      { storyId: entry.story.id, kind: "suggestion", body },
      { onSuccess: () => setFeedback(null) },
    )
  }

  return (
    <Story.Root story={entry.story} className="flex flex-col gap-2 p-3">
      <Story.Meta />
      <Story.Title className="text-sm" />

      {entry.steps.length > 0 ? (
        <ol className="ml-4 list-decimal space-y-1 text-xs leading-5 text-muted-foreground marker:text-muted-foreground/60">
          {entry.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          className="max-sm:min-h-11"
          onClick={() => {
            onNavigate()
            void navigate({ to: entry.href })
          }}
          size="sm"
          variant="outline"
        >
          {entry.targeted ? "Take me there" : "Open the story"}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        <Button
          className="max-sm:min-h-11"
          disabled={busy}
          onClick={() => pass.mutate({ storyId: entry.story.id })}
          size="sm"
          variant="ghost"
        >
          <CheckIcon data-icon="inline-start" />
          {pass.isPending ? "Shipping…" : "It works"}
        </Button>
        <Button
          aria-expanded={feedback !== null}
          className="max-sm:min-h-11"
          onClick={() =>
            setFeedback((current) => (current === null ? "" : null))
          }
          size="sm"
          variant="ghost"
        >
          <MessageSquareIcon data-icon="inline-start" />
          Feedback
        </Button>
      </div>

      {feedback !== null ? (
        <div className="flex flex-col gap-1.5">
          <Textarea
            aria-label={`Feedback on ${entry.story.id}`}
            autoFocus
            className="min-h-16 text-xs"
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="What went wrong, or what to change…"
            value={draft}
          />
          <div className="flex justify-end">
            <Button
              className="max-sm:min-h-11"
              disabled={busy || draft.trim().length === 0}
              onClick={submitFeedback}
              size="sm"
            >
              {addComment.isPending ? "Posting…" : "Post to the story"}
            </Button>
          </div>
        </div>
      ) : null}

      {pass.isError || addComment.isError ? (
        <p className="text-xs text-destructive">
          That write was refused. The story is unchanged.
        </p>
      ) : null}
    </Story.Root>
  )
}
