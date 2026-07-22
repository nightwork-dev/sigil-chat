import { useState, type FormEvent } from "react"
import {
  BookOpenTextIcon,
  EyeIcon,
  LoaderCircleIcon,
  PencilLineIcon,
} from "lucide-react"

import { ChatMarkdown } from "@workspace/chat/components/chat-markdown"

import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { MAX_BLACKBOARD_CONTENT_CHARS } from "@workspace/blackboard-store/limits"

import {
  useBlackboard,
  useContainerBlackboard,
  useWriteBlackboard,
  useWriteContainerBlackboard,
} from "@/lib/blackboard"
import type { BlackboardTier } from "@/lib/blackboard-scope"
import type { BlackboardDoc } from "@workspace/blackboard-store/types"

export interface SessionBlackboardProps {
  sessionId: string
  /** The active thread's bound workspace, if any — enables the workspace
   *  tab. Omitted for an unbound thread. */
  workspaceId?: string
  /** The thread's resolved project (personal project included) — enables
   *  the project tab. */
  projectId?: string
}

const TIER_LABEL: Record<BlackboardTier, string> = {
  session: "Session",
  workspace: "Workspace",
  project: "Project",
}

export function SessionBlackboard({
  sessionId,
  workspaceId,
  projectId,
}: SessionBlackboardProps) {
  const [open, setOpen] = useState(false)
  const [tier, setTier] = useState<BlackboardTier>("session")
  const availableTiers: BlackboardTier[] = [
    "session",
    ...(workspaceId ? (["workspace"] as const) : []),
    ...(projectId ? (["project"] as const) : []),
  ]
  const activeTier = availableTiers.includes(tier) ? tier : "session"

  // Every tier's query is declared unconditionally (hooks rule); only the
  // active tier's is enabled, so switching tabs costs one fetch, not three.
  const sessionBlackboard = useBlackboard(
    open && activeTier === "session" ? sessionId : undefined,
  )
  const workspaceBlackboard = useContainerBlackboard(
    open && activeTier === "workspace" && workspaceId
      ? { tier: "workspace", id: workspaceId }
      : undefined,
  )
  const projectBlackboard = useContainerBlackboard(
    open && activeTier === "project" && projectId
      ? { tier: "project", id: projectId }
      : undefined,
  )
  const writeBlackboard = useWriteBlackboard()
  const writeContainerBlackboard = useWriteContainerBlackboard()

  const active =
    activeTier === "session"
      ? sessionBlackboard
      : activeTier === "workspace"
        ? workspaceBlackboard
        : projectBlackboard

  function save(content: string, expectedRevision: string, onSuccess: (doc: BlackboardDoc) => void) {
    if (activeTier === "session") {
      writeBlackboard.mutate(
        { sessionId, content, expectedRevision },
        { onSuccess },
      )
      return
    }
    const id = activeTier === "workspace" ? workspaceId : projectId
    if (!id) return
    writeContainerBlackboard.mutate(
      { scope: { tier: activeTier, id }, content, expectedRevision },
      { onSuccess },
    )
  }

  const writeState = activeTier === "session" ? writeBlackboard : writeContainerBlackboard

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={
          <Button
            aria-label="Open blackboard"
            className="max-sm:size-11"
            size="icon-xs"
            title="Blackboard"
            variant="ghost"
          />
        }
      >
        <BookOpenTextIcon />
      </SheetTrigger>
      <SheetContent className="w-[min(30rem,calc(100vw-1rem))]" side="right">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle>Blackboard</SheetTitle>
          <SheetDescription>
            Shared working notes for you and the agent — the session tab is
            private to this conversation; workspace and project tabs are
            shared with every session in that container.
          </SheetDescription>
        </SheetHeader>
        {availableTiers.length > 1 ? (
          <div className="border-b border-border px-4 py-2">
            <Tabs onValueChange={(value) => setTier(value as BlackboardTier)} value={activeTier}>
              <TabsList>
                {availableTiers.map((candidate) => (
                  <TabsTrigger key={candidate} value={candidate}>
                    {TIER_LABEL[candidate]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {active.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Loading notes…
            </div>
          ) : active.isError ? (
            <p className="text-sm text-destructive">
              The blackboard could not be loaded.
            </p>
          ) : (
            <BlackboardEditor
              document={active.data}
              key={activeTier}
              onReload={async () => (await active.refetch()).data}
              onSave={save}
              writeError={writeState.isError}
              writePending={writeState.isPending}
              writeReset={() => writeState.reset()}
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
  onSave,
  writeError,
  writePending,
  writeReset,
}: {
  document: BlackboardDoc
  onReload: () => Promise<BlackboardDoc | undefined>
  onSave: (
    content: string,
    expectedRevision: string,
    onSuccess: (doc: BlackboardDoc) => void,
  ) => void
  writeError: boolean
  writePending: boolean
  writeReset: () => void
}) {
  const [mode, setMode] = useState<"read" | "edit">(
    document.content.trim() ? "read" : "edit",
  )
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
    onSave(draft, expectedRevision, (saved) => {
      setDraft(saved.content)
      setBaseContent(saved.content)
      setBaseRevision(saved.revision)
      setMode("read")
    })
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
    writeReset()
  }

  function beginEditing() {
    setDraft(document.content)
    setBaseContent(document.content)
    setBaseRevision(document.revision)
    writeReset()
    setMode("edit")
  }

  return (
    <div className="flex h-full min-h-80 flex-col gap-3">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {document.updatedAt
            ? `Last updated ${new Date(document.updatedAt).toLocaleString()}`
            : "No notes yet"}
        </p>
        <div className="flex items-center gap-1">
          <Button
            aria-pressed={mode === "read"}
            disabled={!document.content.trim()}
            onClick={() => setMode("read")}
            size="xs"
            type="button"
            variant={mode === "read" ? "secondary" : "ghost"}
          >
            <EyeIcon />
            Read
          </Button>
          <Button
            aria-pressed={mode === "edit"}
            onClick={beginEditing}
            size="xs"
            type="button"
            variant={mode === "edit" ? "secondary" : "ghost"}
          >
            <PencilLineIcon />
            Edit
          </Button>
        </div>
      </div>
      {mode === "read" ? (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <ChatMarkdown content={document.content} />
        </div>
      ) : (
        <form
          className="flex min-h-0 flex-1 flex-col gap-3"
          onSubmit={handleSubmit}
        >
      <Textarea
        aria-label="Blackboard notes"
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
              disabled={writePending}
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
      <div className="flex items-center justify-end gap-3">
        <Button disabled={writePending || remoteChanged} size="sm" type="submit">
          {writePending ? "Saving…" : "Save notes"}
        </Button>
      </div>
      {writeError ? (
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
      )}
    </div>
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
