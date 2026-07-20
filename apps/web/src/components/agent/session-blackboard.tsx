import { useState, type FormEvent } from "react"
import { BookOpenTextIcon, LoaderCircleIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Textarea } from "@workspace/ui/components/textarea"
import { MAX_BLACKBOARD_CONTENT_CHARS } from "@workspace/blackboard-store/limits"

import { useBlackboard, useWriteBlackboard } from "@/lib/blackboard"
import type { BlackboardDoc } from "@workspace/blackboard-store/types"

export function SessionBlackboard({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const blackboard = useBlackboard(open ? sessionId : undefined)
  const writeBlackboard = useWriteBlackboard()

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={
          <Button
            aria-label="Open session blackboard"
            className="max-sm:size-11"
            size="icon-xs"
            title="Session blackboard"
            variant="ghost"
          />
        }
      >
        <BookOpenTextIcon />
      </SheetTrigger>
      <SheetContent className="w-[min(30rem,calc(100vw-1rem))]" side="right">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle>Session blackboard</SheetTitle>
          <SheetDescription>
            Shared working notes for you and the agent in this conversation.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {blackboard.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Loading notes…
            </div>
          ) : blackboard.isError ? (
            <p className="text-sm text-destructive">
              The blackboard could not be loaded.
            </p>
          ) : (
            <BlackboardEditor
              document={blackboard.data}
              onReload={async () => (await blackboard.refetch()).data}
              sessionId={sessionId}
              writeBlackboard={writeBlackboard}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function BlackboardEditor({
  document,
  onReload,
  sessionId,
  writeBlackboard,
}: {
  document: BlackboardDoc
  onReload: () => Promise<BlackboardDoc | undefined>
  sessionId: string
  writeBlackboard: ReturnType<typeof useWriteBlackboard>
}) {
  const [draft, setDraft] = useState(document.content)
  const [baseContent, setBaseContent] = useState(document.content)
  const [baseRevision, setBaseRevision] = useState(document.revision)
  const { remoteChanged } = blackboardEditState({
    baseContent,
    baseRevision,
    draft,
    remoteRevision: document.revision,
  })

  function save(expectedRevision: string) {
    writeBlackboard.mutate(
      {
        sessionId,
        content: draft,
        expectedRevision,
      },
      {
        onSuccess: (saved) => {
          setBaseContent(saved.content)
          setBaseRevision(saved.revision)
        },
      },
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!remoteChanged) save(baseRevision)
  }

  async function loadLatest() {
    const latest = await onReload()
    if (!latest) return
    setDraft(latest.content)
    setBaseContent(latest.content)
    setBaseRevision(latest.revision)
    writeBlackboard.reset()
  }

  return (
    <form
      className="flex h-full min-h-80 flex-col gap-3"
      onSubmit={handleSubmit}
    >
      <Textarea
        aria-label="Session blackboard notes"
        className="min-h-64 flex-1 resize-none font-mono text-sm leading-6"
        maxLength={MAX_BLACKBOARD_CONTENT_CHARS}
        name="content"
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Keep decisions, constraints, and working notes here…"
        value={draft}
      />
      {remoteChanged ? (
        <div className="border-l-2 border-warning pl-3 text-sm">
          <p>The agent changed these notes while you were editing.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => void loadLatest()}
              size="sm"
              type="button"
              variant="outline"
            >
              Load latest
            </Button>
            <Button
              disabled={writeBlackboard.isPending}
              onClick={() => save(document.revision)}
              size="sm"
              type="button"
              variant="outline"
            >
              Overwrite with my draft
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {document.updatedAt
            ? `Last updated ${new Date(document.updatedAt).toLocaleString()}`
            : "No notes yet"}
        </p>
        <Button
          disabled={writeBlackboard.isPending || remoteChanged}
          size="sm"
          type="submit"
        >
          {writeBlackboard.isPending ? "Saving…" : "Save notes"}
        </Button>
      </div>
      {writeBlackboard.isError ? (
        <div className="flex items-center justify-between gap-3 text-sm text-destructive">
          <span>The notes may have changed before this save completed.</span>
          <Button
            onClick={() => void loadLatest()}
            size="sm"
            type="button"
            variant="outline"
          >
            Check latest
          </Button>
        </div>
      ) : null}
    </form>
  )
}

export function blackboardEditState(input: {
  baseContent: string
  baseRevision: string
  draft: string
  remoteRevision: string
}) {
  const remoteChanged = input.remoteRevision !== input.baseRevision
  return {
    dirty: input.draft !== input.baseContent,
    remoteChanged,
    canSave: !remoteChanged,
  }
}
