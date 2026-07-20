"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  ImageIcon,
  LibraryBigIcon,
  SparklesIcon,
} from "lucide-react"
import { useAgentThreadControls } from "@zigil/agent-react/thread-controls"
import type {
  AttentionContext,
  AttentionSelection,
} from "@zigil/agent-react/attention"
import { useAttentionTelemetry } from "@zigil/agent-react/attention-telemetry"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  DistilledCard,
  type DistilledArtifact,
} from "@/components/agent/distilled-artifact-card"
import {
  usePublishWorkspaceAttention,
  usePublishWorkspaceResourceScope,
} from "@/components/agent/workspace-attention"
import { EVIDENCE_ROOM_SCOPE } from "@/lib/evidence"
import {
  artifactUrl,
  useArtifactPreview,
  useArtifacts,
  type ArtifactRecord,
} from "@/lib/artifacts"

type ScopeChoice = "evidence" | "session"
type ArtifactFilter = "all" | "files" | "images" | "distills"

const DISTILL_MEDIA_TYPE = "application/vnd.sigil.distill+json"

/**
 * A scope-aware index over artifacts that already exist in Gonk. It is not a
 * second library: Evidence remains the place to curate the shared corpus;
 * this workspace lets someone follow an artifact from a live session back to
 * that corpus, inspect its bytes, and see the provenance the store actually
 * records today.
 */
export function ArtifactWorkspace() {
  const controls = useAgentThreadControls()
  const telemetry = useAttentionTelemetry()
  const [scopeChoice, setScopeChoice] = useState<ScopeChoice>("evidence")
  const [filter, setFilter] = useState<ArtifactFilter>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const sessionScope = controls?.activeThreadId
    ? `session:${controls.activeThreadId}`
    : null
  const scope = scopeChoice === "evidence" ? EVIDENCE_ROOM_SCOPE : sessionScope
  const artifactsQuery = useArtifacts(scope)
  const artifacts = artifactsQuery.data ?? []
  const visibleArtifacts = artifacts.filter((artifact) =>
    matchesFilter(artifact, filter),
  )
  const selected =
    visibleArtifacts.find((artifact) => artifact.id === selectedId) ?? null
  const previewQuery = useArtifactPreview(scope, selected?.id ?? null)

  const attention: AttentionContext = useMemo(
    () => ({
      application: "sigil-chat",
      route: "/artifacts",
      workspace: { kind: "artifacts", id: "artifacts", label: "Artifacts" },
      selection: selected ? artifactTarget(selected) : undefined,
      selections: selected ? [artifactTarget(selected)] : undefined,
      history: telemetry.history,
    }),
    [selected, telemetry.history],
  )
  usePublishWorkspaceAttention(attention)
  usePublishWorkspaceResourceScope(scope)

  const selectArtifact = (artifact: ArtifactRecord) => {
    setSelectedId(artifact.id)
    telemetry.recordActivity("focus", artifactTarget(artifact), {
      summary: `Focused ${artifact.filename}`,
    })
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-background">
      <header className="flex min-h-11 items-center gap-2 border-b border-border px-3 py-1.5">
        <LibraryBigIcon className="size-4 shrink-0 text-primary" />
        <h1 className="text-sm font-semibold">Artifacts</h1>
        <span className="truncate text-xs text-muted-foreground">
          {scopeChoice === "evidence"
            ? "Shared evidence corpus"
            : "Current conversation"}
        </span>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1" aria-label="Artifact scope">
          <ScopeButton
            active={scopeChoice === "evidence"}
            onClick={() => {
              setScopeChoice("evidence")
              setSelectedId(null)
            }}
          >
            Evidence
          </ScopeButton>
          <ScopeButton
            active={scopeChoice === "session"}
            disabled={!sessionScope}
            onClick={() => {
              setScopeChoice("session")
              setSelectedId(null)
            }}
          >
            This session
          </ScopeButton>
        </div>
        <div
          className="flex items-center gap-1"
          aria-label="Artifact type filter"
        >
          {(["all", "files", "images", "distills"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "secondary" : "ghost"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className="capitalize"
            >
              {value}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)] lg:divide-x lg:divide-border">
        <ArtifactList
          artifacts={visibleArtifacts}
          selectedId={selectedId}
          isLoading={artifactsQuery.isPending}
          isError={artifactsQuery.isError}
          scopeChoice={scopeChoice}
          onSelect={selectArtifact}
        />
        <ArtifactDetail
          artifact={selected}
          scope={scope}
          preview={previewQuery.data}
          isLoading={previewQuery.isPending}
          isError={previewQuery.isError}
        />
      </div>
    </div>
  )
}

function ScopeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      size="sm"
      variant={active ? "secondary" : "ghost"}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function ArtifactList({
  artifacts,
  selectedId,
  isLoading,
  isError,
  scopeChoice,
  onSelect,
}: {
  artifacts: ArtifactRecord[]
  selectedId: string | null
  isLoading: boolean
  isError: boolean
  scopeChoice: ScopeChoice
  onSelect: (artifact: ArtifactRecord) => void
}) {
  return (
    <section
      className="scroll-area min-h-0 overflow-y-auto p-3"
      aria-label="Artifact list"
    >
      {isError ? (
        <p className="text-sm text-destructive">
          Couldn’t load this artifact scope.
        </p>
      ) : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading artifacts…</p>
      ) : null}
      {!isLoading && !isError && artifacts.length === 0 ? (
        <div className="space-y-2 py-8 text-sm text-muted-foreground">
          <p>No artifacts match this view.</p>
          {scopeChoice === "evidence" ? (
            <Link
              to="/evidence"
              className="text-primary underline-offset-2 hover:underline"
            >
              Open Evidence Room to add documents
            </Link>
          ) : (
            <p>
              Attach a file or ask the agent to generate, distill, or research
              something in this conversation.
            </p>
          )}
        </div>
      ) : null}
      <ul className="space-y-1">
        {artifacts.map((artifact) => (
          <li key={artifact.id}>
            <button
              type="button"
              aria-pressed={selectedId === artifact.id}
              onClick={() => onSelect(artifact)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                selectedId === artifact.id
                  ? "bg-primary/10 text-foreground"
                  : "text-foreground/85 hover:bg-muted/55",
              )}
            >
              <ArtifactIcon artifact={artifact} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {artifact.filename}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                  {artifactKind(artifact)} · {formatBytes(artifact.size)} ·{" "}
                  {formatDate(artifact.createdAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ArtifactDetail({
  artifact,
  scope,
  preview,
  isLoading,
  isError,
}: {
  artifact: ArtifactRecord | null
  scope: string | null
  preview: ReturnType<typeof useArtifactPreview>["data"]
  isLoading: boolean
  isError: boolean
}) {
  if (!artifact || !scope) {
    return (
      <section
        className="flex min-h-0 items-center justify-center p-6 text-center text-sm text-muted-foreground"
        aria-label="Artifact detail"
      >
        Select an artifact to inspect its contents and recorded provenance.
      </section>
    )
  }
  const distill =
    preview?.kind === "text"
      ? parseDistill(preview.content, artifact.mediaType)
      : null
  return (
    <section
      className="scroll-area min-h-0 overflow-y-auto p-4"
      aria-label="Artifact detail"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ArtifactIcon artifact={artifact} />
            <h2 className="truncate text-base font-semibold">
              {artifact.filename}
            </h2>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {artifact.mediaType} · {formatBytes(artifact.size)}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          render={
            <a
              href={artifactUrl(artifact.id, scope)}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          Open
        </Button>
      </div>

      <dl className="grid gap-2 border-b border-border py-3 text-xs sm:grid-cols-2">
        <ProvenanceRow label="Scope" value={scope} />
        <ProvenanceRow
          label="Captured"
          value={formatDate(artifact.createdAt)}
        />
        <ProvenanceRow label="Kind" value={artifactKind(artifact)} />
        <ProvenanceRow
          label="Lineage"
          value={
            distill?.sourceLabel
              ? `Distilled from ${distill.sourceLabel}`
              : "No source relationship recorded"
          }
        />
      </dl>

      <div className="pt-4">
        {isError ? (
          <p className="text-sm text-destructive">
            Couldn’t read this artifact.
          </p>
        ) : null}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading preview…</p>
        ) : null}
        {preview?.kind === "image" ? (
          <img
            src={artifactUrl(artifact.id, scope)}
            alt={artifact.filename}
            className="max-h-[32rem] w-auto max-w-full rounded-md border border-border object-contain"
          />
        ) : null}
        {distill ? <DistilledCard distilled={distill} /> : null}
        {preview?.kind === "text" && !distill ? (
          <TextPreview
            content={preview.content}
            truncated={preview.truncated}
          />
        ) : null}
        {preview?.kind === "binary" ? (
          <p className="text-sm text-muted-foreground">
            This binary artifact can be opened in a separate tab, but does not
            have an in-app preview yet.
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        The store currently records scope, media type, capture time, and distill
        source links. Tool run, editor history, and research-source lineage are
        not persisted yet, so this view does not invent them.
      </p>
    </section>
  )
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className="mt-0.5 truncate font-mono text-[10px] text-foreground/80"
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

function TextPreview({
  content,
  truncated,
}: {
  content: string
  truncated: boolean
}) {
  return (
    <div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/85">
        {content}
      </pre>
      {truncated ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Preview is truncated. Open the original for the full file.
        </p>
      ) : null}
    </div>
  )
}

function ArtifactIcon({ artifact }: { artifact: ArtifactRecord }) {
  const Icon =
    artifact.mediaType === DISTILL_MEDIA_TYPE
      ? SparklesIcon
      : artifact.mediaType.startsWith("image/")
        ? ImageIcon
        : artifact.mediaType.includes("json")
          ? FileJsonIcon
          : artifact.mediaType.startsWith("text/")
            ? FileTextIcon
            : FileIcon
  return <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
}

function artifactKind(artifact: ArtifactRecord): string {
  if (artifact.mediaType === DISTILL_MEDIA_TYPE) return "Distill"
  if (artifact.mediaType.startsWith("image/")) return "Image"
  if (
    artifact.mediaType.startsWith("text/") ||
    artifact.mediaType.includes("json")
  )
    return "File"
  return "Binary"
}

function matchesFilter(
  artifact: ArtifactRecord,
  filter: ArtifactFilter,
): boolean {
  if (filter === "all") return true
  if (filter === "images") return artifact.mediaType.startsWith("image/")
  if (filter === "distills") return artifact.mediaType === DISTILL_MEDIA_TYPE
  return (
    artifact.mediaType !== DISTILL_MEDIA_TYPE &&
    !artifact.mediaType.startsWith("image/")
  )
}

function artifactTarget(artifact: ArtifactRecord): AttentionSelection {
  return { kind: "artifact", id: artifact.id, label: artifact.filename }
}

function parseDistill(
  content: string,
  mediaType: string,
): DistilledArtifact | null {
  if (mediaType !== DISTILL_MEDIA_TYPE) return null
  try {
    const value = JSON.parse(content) as Partial<DistilledArtifact>
    if (
      typeof value.title !== "string" ||
      typeof value.question !== "string" ||
      typeof value.summary !== "string" ||
      typeof value.resolution !== "string" ||
      !Array.isArray(value.references)
    )
      return null
    return value as DistilledArtifact
  } catch {
    return null
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
}
