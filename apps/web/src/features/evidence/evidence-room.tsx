"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  FileTextIcon,
  LibraryBigIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import {
  type AttentionContext,
  type AttentionSelection,
} from "@zigil/agent-react/attention"
import { useAttentionTelemetry } from "@zigil/agent-react/attention-telemetry"
import { usePublishWorkspaceAttention } from "@/components/agent/workspace-attention"

import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { useFileUpload } from "@workspace/ui/hooks/use-file-upload"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  DistilledCard,
  type DistilledArtifact,
} from "@/components/agent/distilled-artifact-card"
import {
  useDeleteEvidenceDocument,
  useEvidenceDocuments,
  useUploadEvidenceDocument,
  type EvidenceDocument,
} from "@/lib/evidence"

/** A distilled artifact produced this session. */
export interface EvidenceDistill {
  artifactId: string
  distilled: DistilledArtifact
}

type MobileTab = "library" | "distills" | "ask"

const ACCEPTED_TYPES = ".md,.txt,.markdown,.pdf,text/*,application/pdf,application/json"
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

/**
 * The Evidence Room workspace (D4.4): a persistent document library, a
 * distilled-cards gallery, and an ask panel — composing the D4.1/D4.2 pieces
 * into a discoverable, generalizable surface. Its point is the attention loop:
 * what the user has open/focused flows into the agent's context, so "distill
 * this" resolves to the focused document without naming it.
 *
 * The library is a real product surface (David: "an actual product I can load
 * data into persistently") — documents are durable project-tier artifacts
 * (`lib/evidence.ts`) that survive sessions and reloads, not session ephemera.
 */
export function EvidenceRoom() {
  const isMobile = useIsMobile()
  const telemetry = useAttentionTelemetry()
  const documentsQuery = useEvidenceDocuments()
  const uploadDocument = useUploadEvidenceDocument()
  const deleteDocument = useDeleteEvidenceDocument()
  const [distills] = useState<EvidenceDistill[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [tab, setTab] = useState<MobileTab>("library")

  const documents = documentsQuery.data ?? []
  const selectedDoc = documents.find((doc) => doc.id === selectedDocId) ?? null

  const selectDocument = (doc: EvidenceDocument) => {
    setSelectedDocId(doc.id)
    telemetry.recordActivity("focus", documentTarget(doc), {
      summary: `Focused ${doc.filename}`,
    })
  }

  // What the user is looking at → the agent's context. "distill this" / "what
  // does this say about X" resolve against this without naming the document.
  const attention: AttentionContext = useMemo(
    () => ({
      application: "sigil-chat",
      route: "/evidence",
      workspace: { kind: "evidence-room", id: "evidence", label: "Evidence Room" },
      selection: selectedDoc ? documentTarget(selectedDoc) : undefined,
      selections: selectedDoc ? [documentTarget(selectedDoc)] : undefined,
      history: telemetry.history,
    }),
    [selectedDoc, telemetry.history],
  )

  // S1.9: publish to the shell HUD (see workspace-attention) — no local
  // AttentionProvider; the persistent HUD in _app reads this.
  usePublishWorkspaceAttention(attention)

  const library = (
    <LibraryRegion
      documents={documents}
      isLoading={documentsQuery.isPending}
      isError={documentsQuery.isError}
      selectedDocId={selectedDocId}
      onSelect={selectDocument}
      onUpload={(file) => uploadDocument.mutate(file)}
      isUploading={uploadDocument.isPending}
      onDelete={(doc) => {
        if (doc.id === selectedDocId) setSelectedDocId(null)
        deleteDocument.mutate(doc.id)
      }}
      deletingId={deleteDocument.isPending ? deleteDocument.variables : undefined}
    />
  )
  const gallery = <GalleryRegion distills={distills} />
  const ask = <AskRegion selectedDoc={selectedDoc} />

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
      <header className="flex min-h-11 items-center gap-2 border-b border-border px-3 py-1.5">
        <LibraryBigIcon className="size-4 shrink-0 text-primary" />
        <h1 className="text-sm font-semibold">Evidence Room</h1>
        {selectedDoc ? (
          <span className="ml-1 truncate text-xs text-muted-foreground">
            · {selectedDoc.filename} in focus
          </span>
        ) : null}
      </header>

      {isMobile ? (
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <nav className="flex gap-1 border-b border-border px-2 py-1.5">
            {(["library", "distills", "ask"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={tab === value ? "secondary" : "ghost"}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                className="flex-1 capitalize"
              >
                {value}
              </Button>
            ))}
          </nav>
          <div className="scroll-area min-h-0 overflow-y-auto">
            {tab === "library" ? library : tab === "distills" ? gallery : ask}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,22rem)] divide-x divide-border">
          <div className="scroll-area min-h-0 overflow-y-auto">{library}</div>
          <div className="scroll-area min-h-0 overflow-y-auto">{gallery}</div>
          <div className="scroll-area min-h-0 overflow-y-auto">{ask}</div>
        </div>
      )}
    </div>
  )
}

function documentTarget(doc: EvidenceDocument): AttentionSelection {
  return { kind: "document", id: doc.id, label: doc.filename }
}

function RegionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  )
}

function LibraryRegion({
  documents,
  isLoading,
  isError,
  selectedDocId,
  onSelect,
  onUpload,
  isUploading,
  onDelete,
  deletingId,
}: {
  documents: EvidenceDocument[]
  isLoading: boolean
  isError: boolean
  selectedDocId: string | null
  onSelect: (doc: EvidenceDocument) => void
  onUpload: (file: File) => void
  isUploading: boolean
  onDelete: (doc: EvidenceDocument) => void
  deletingId: string | undefined
}) {
  const upload = useFileUpload({
    accept: ACCEPTED_TYPES,
    multiple: true,
    maxSize: MAX_EVIDENCE_BYTES,
    onFiles: (files) => files.forEach((file) => onUpload(file)),
  })

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <RegionLabel>Documents</RegionLabel>
        <Button size="sm" variant="ghost" onClick={upload.open} disabled={isUploading}>
          <UploadIcon className="size-3.5" />
          {isUploading ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {/* Empty state IS the actions surface (drop zone), never a redirect. */}
      <div
        {...upload.getRootProps()}
        className={cn(
          "rounded-md border border-dashed px-3 py-4 text-center text-xs transition-colors",
          upload.isDragging
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground",
        )}
      >
        <input {...upload.getInputProps()} />
        <p>
          Drop documents here, or{" "}
          <button
            type="button"
            onClick={upload.open}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            choose files
          </button>
          . They stay with the work across sessions.
        </p>
      </div>

      {isError ? (
        <p className="text-xs text-destructive">
          Couldn’t load the document library. Retry shortly.
        </p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Loading documents…</p>
      ) : documents.length > 0 ? (
        <ul className="space-y-1">
          {documents.map((doc) => (
            <li key={doc.id} className="group/doc flex items-stretch gap-1">
              <button
                type="button"
                aria-pressed={doc.id === selectedDocId}
                onClick={() => onSelect(doc)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                  doc.id === selectedDocId
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-foreground/80 hover:border-border/80 hover:bg-muted/40",
                )}
              >
                <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{doc.filename}</span>
              </button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${doc.filename}`}
                disabled={deletingId === doc.id}
                onClick={() => onDelete(doc)}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/doc:opacity-100 focus-visible:opacity-100"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function GalleryRegion({ distills }: { distills: EvidenceDistill[] }) {
  return (
    <div className="space-y-2 p-3">
      <RegionLabel>Distilled</RegionLabel>
      {distills.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SparklesIcon className="size-3.5" /> Distilled cards land here. Select a
          document and say “distill this”.
        </p>
      ) : (
        <div className="space-y-2">
          {distills.map((entry) => (
            <DistilledCard key={entry.artifactId} distilled={entry.distilled} />
          ))}
        </div>
      )}
    </div>
  )
}

function AskRegion({ selectedDoc }: { selectedDoc: EvidenceDocument | null }) {
  return (
    <div className="space-y-2 p-3">
      <RegionLabel>Ask with citations</RegionLabel>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {selectedDoc
          ? `Ask a question about "${selectedDoc.filename}" — answers cite the exact passage.`
          : "Select a document, then ask a question — answers cite the exact source passage."}
      </p>
    </div>
  )
}
