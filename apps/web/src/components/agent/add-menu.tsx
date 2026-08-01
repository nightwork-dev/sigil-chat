"use client"

// SC.10 §9.8 — the composer's ＋ Add menu: the extensible attach entry
// point for the three attachable nouns defined in `@/lib/add-sources`
// (files, workspace-resource, session-note). Two triggers open the same
// menu (the ＋ button and `@` typed at a word boundary in the textarea,
// wired by the caller through `open`/`onOpenChange`) — one popover, not two
// surfaces to keep in sync. Nothing here is a verb: no skill/tool launcher
// is ever rendered — that boundary is enforced by only importing from
// `add-sources`'s closed union and the two existing principal-filtered
// listing hooks (`useEvidenceDocuments`, `useArtifacts`), never a
// capability-invocation API.

import { useState } from "react"
import {
  FileIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  NotebookPenIcon,
  PlusIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import { SessionBlackboardSheet } from "@/components/agent/session-blackboard"
import {
  mergeWorkspaceResourceCandidates,
  type WorkspaceResourceCandidate,
} from "@/lib/add-sources"
import { useArtifacts } from "@/lib/artifacts"
import { useEvidenceDocuments, useEvidenceRoomScope } from "@/lib/evidence"

export interface AddMenuProps {
  /** Controlled so `@` (typed in the textarea) can open the same menu the
   *  ＋ button does — one popover, two triggers (§9.8c). */
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly openFilePicker: () => void
  /** Resolves a selected workspace-resource candidate into a message
   *  attachment (the composer's existing attach mechanism — `addUrl`, no
   *  re-upload of already-stored bytes). */
  readonly onAttachResource: (candidate: WorkspaceResourceCandidate) => void
  readonly sessionId: string
  readonly workspaceId?: string
  readonly projectId?: string
  /** Scope artifacts are listed under (the session's active resource
   *  scope) — `null` while unresolved disables the artifacts query. */
  readonly artifactScope: string | null
  readonly className?: string
}

export function AddMenu({
  open,
  onOpenChange,
  openFilePicker,
  onAttachResource,
  sessionId,
  workspaceId,
  projectId,
  artifactScope,
  className,
}: AddMenuProps) {
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange} open={open}>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Add to this conversation"
              className={cn("size-7 shrink-0 max-sm:size-11", className)}
              size="icon-xs"
              title="Add"
              variant="ghost"
            />
          }
        >
          <PlusIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem
            onClick={() => {
              onOpenChange(false)
              openFilePicker()
            }}
          >
            <FileIcon /> Attach files
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onOpenChange(false)
              setWorkspacePickerOpen(true)
            }}
          >
            <FolderOpenIcon /> Add from workspace
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onOpenChange(false)
              setNotesOpen(true)
            }}
          >
            <NotebookPenIcon /> Session note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WorkspaceResourcePicker
        artifactScope={artifactScope}
        onAttach={(candidate) => {
          onAttachResource(candidate)
          setWorkspacePickerOpen(false)
        }}
        onOpenChange={setWorkspacePickerOpen}
        open={workspacePickerOpen}
      />

      <SessionBlackboardSheet
        onOpenChange={setNotesOpen}
        open={notesOpen}
        projectId={projectId}
        sessionId={sessionId}
        workspaceId={workspaceId}
      />
    </>
  )
}

/** The "Add from workspace" entry's picker — a bounded, single-select list
 *  over what the two existing principal-scoped listings already return
 *  (§9.8b(3)/(4): never a browsable capability catalog, never a query this
 *  component invents itself). */
function WorkspaceResourcePicker({
  open,
  onOpenChange,
  onAttach,
  artifactScope,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAttach: (candidate: WorkspaceResourceCandidate) => void
  artifactScope: string | null
}) {
  const evidenceScope = useEvidenceRoomScope()
  const evidence = useEvidenceDocuments(open ? evidenceScope : null)
  const artifacts = useArtifacts(open ? artifactScope : null)
  const loading = evidence.isPending || artifacts.isPending
  const candidates = mergeWorkspaceResourceCandidates(
    evidence.data ?? [],
    artifacts.data ?? [],
    artifactScope ?? "",
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add from workspace</DialogTitle>
          <DialogDescription>
            Attach a document or artifact already in this scope — the agent sees
            it the same way as a freshly uploaded file.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Loading…
            </div>
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing here yet — upload a document to the Evidence Room or
              produce an artifact first.
            </p>
          ) : (
            candidates.map((candidate) => (
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                key={`${candidate.kind}:${candidate.id}`}
                onClick={() => onAttach(candidate)}
                type="button"
              >
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {candidate.filename}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {candidate.kind}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
