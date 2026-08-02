// VQ.1 — the owner's verification queue, in the app.
//
// Mounted once in the _app shell so the queue is reachable from whatever
// surface the owner is standing on, which is the point: these stories are
// checked by USING the app, and walking back to a board to tick a box is the
// friction this removes.
//
// Registry loop (step 0 → extracted): the panel is @workspace/ui's QuestLog,
// carried in from sigil-design, which extracted it from sigil-game's tutorial
// quest panel. None of the shell is authored here. What IS app-domain is
// which stories belong in the pile, where each one gets checked, and what
// checking one off means to the roadmap store.
//
// The log keeps this session's passes visible as completed entries rather
// than only draining. A quest log that empties as you work shows a shrinking
// list and no evidence of the work; keeping the checks makes the progress bar
// mean something and gives the pass a visible result. That record is local to
// the session — the durable one is the story's status and its owner-pass
// comment in the roadmap repository.
//
// Bottom-LEFT on purpose: the agent HUD owns bottom-right in this shell.

import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowRightIcon, CheckIcon, MessageSquareIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { QuestLog } from "@workspace/ui/components/quest-log"
import { Textarea } from "@workspace/ui/components/textarea"

import { Story } from "@/components/roadmap/story"
import { useAddComment, useStories } from "@/lib/work-items"
import {
  selectVerificationQueue,
  useVerificationPass,
  useVerificationQueueAccess,
  type VerificationQueueEntry,
} from "@/lib/verification-queue"

export const VERIFICATION_FEEDBACK_TEXTAREA_CLASS_NAME =
  "min-h-16 text-base md:text-sm"

/** A story passed in this browser session, held only to keep its row visible. */
interface PassedStory {
  id: string
  title: string
}

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
  const [passed, setPassed] = useState<PassedStory[]>([])

  const passedIds = new Set(passed.map((story) => story.id))
  // A refused write re-invalidates and the story comes back as verify. Drop it
  // from the passed list on that path, or it would sit in both halves at once.
  const waiting = selectVerificationQueue(stories.data ?? []).filter(
    (entry) => !passedIds.has(entry.story.id),
  )

  // Nothing waiting and nothing done is worth no chrome at all — an empty
  // quest log is noise.
  if (waiting.length === 0 && passed.length === 0) return null

  return (
    <div className="fixed bottom-4 left-4 z-30 max-sm:bottom-2 max-sm:left-2">
      <QuestLog.Root
        completed={passed.length}
        onOpenChange={setOpen}
        open={open}
        total={waiting.length + passed.length}
      >
        <QuestLog.Trigger>To verify</QuestLog.Trigger>
        <QuestLog.Panel
          align="start"
          description="Stories waiting on your browser pass."
          side="top"
          title="Verification queue"
        >
          <QuestLog.Progress label="Passed this session" />
          <QuestLog.Entries aria-label="Stories waiting on a browser pass">
            {waiting.map((entry) => (
              <QueueEntry
                entry={entry}
                key={entry.story.id}
                onNavigate={() => setOpen(false)}
                onPassFailed={(id) =>
                  setPassed((current) =>
                    current.filter((story) => story.id !== id),
                  )
                }
                onPassed={(story) =>
                  setPassed((current) => [story, ...current])
                }
              />
            ))}
            {passed.map((story) => (
              <QuestLog.Entry
                complete
                description="Shipped, with an owner-pass comment on the story."
                key={story.id}
                title={
                  <>
                    <span className="font-mono text-xs text-muted-foreground">
                      {story.id}
                    </span>{" "}
                    {story.title}
                  </>
                }
              />
            ))}
          </QuestLog.Entries>
          <QuestLog.Footnote>
            Checking a story off ships it and records the pass in the roadmap
            repository. It says you saw the surface work — it does not stand in
            for the story&apos;s own acceptance criteria.
          </QuestLog.Footnote>
        </QuestLog.Panel>
      </QuestLog.Root>
    </div>
  )
}

function QueueEntry({
  entry,
  onNavigate,
  onPassFailed,
  onPassed,
}: {
  entry: VerificationQueueEntry
  onNavigate: () => void
  onPassFailed: (id: string) => void
  onPassed: (story: PassedStory) => void
}) {
  const navigate = useNavigate()
  const pass = useVerificationPass()
  const addComment = useAddComment()
  const [feedback, setFeedback] = useState<string | null>(null)
  const draft = feedback ?? ""
  const busy = pass.isPending || addComment.isPending

  function checkOff() {
    onPassed({ id: entry.story.id, title: entry.story.title })
    pass.mutate(
      { storyId: entry.story.id },
      { onError: () => onPassFailed(entry.story.id) },
    )
  }

  function submitFeedback() {
    const body = draft.trim()
    if (body.length === 0) return
    addComment.mutate(
      { storyId: entry.story.id, kind: "suggestion", body },
      { onSuccess: () => setFeedback(null) },
    )
  }

  return (
    <QuestLog.Entry
      description={
        <Story.Root story={entry.story}>
          <Story.Meta />
        </Story.Root>
      }
      title={entry.story.title}
      action={
        <div className="flex flex-col gap-2">
          {entry.steps.length > 0 ? (
            <ol className="ml-4 list-decimal space-y-1 text-sm leading-6 text-muted-foreground marker:text-muted-foreground/60">
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
              onClick={checkOff}
              size="sm"
              variant="ghost"
            >
              <CheckIcon data-icon="inline-start" />
              It works
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
                className={VERIFICATION_FEEDBACK_TEXTAREA_CLASS_NAME}
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
            <p className="text-sm text-destructive">
              That write was refused. The story is unchanged.
            </p>
          ) : null}
        </div>
      }
    />
  )
}
