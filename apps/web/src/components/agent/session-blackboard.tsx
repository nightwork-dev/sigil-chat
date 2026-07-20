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

import { useBlackboard, useWriteBlackboard } from "@/lib/blackboard"

export function SessionBlackboard({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const blackboard = useBlackboard(open ? sessionId : undefined)
  const writeBlackboard = useWriteBlackboard()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const content = form.get("content")
    if (typeof content !== "string") return
    writeBlackboard.mutate({ sessionId, content })
  }

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
            <form className="flex h-full min-h-80 flex-col gap-3" onSubmit={handleSubmit}>
              <Textarea
                aria-label="Session blackboard notes"
                className="min-h-64 flex-1 resize-none font-mono text-sm leading-6"
                defaultValue={blackboard.data.content}
                name="content"
                placeholder="Keep decisions, constraints, and working notes here…"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  {blackboard.data.updatedAt
                    ? `Last updated ${new Date(blackboard.data.updatedAt).toLocaleString()}`
                    : "No notes yet"}
                </p>
                <Button disabled={writeBlackboard.isPending} size="sm" type="submit">
                  {writeBlackboard.isPending ? "Saving…" : "Save notes"}
                </Button>
              </div>
              {writeBlackboard.isError ? (
                <p className="text-sm text-destructive">
                  The blackboard could not be saved.
                </p>
              ) : null}
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
