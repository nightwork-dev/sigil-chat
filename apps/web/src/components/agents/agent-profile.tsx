"use client"

// The Agent Studio profile: the deployed persona rendered as a continuous
// individual, not an admin table. Compound Root/Parts over the read-only
// AgentProfile contract (@/lib/agent-profile) — a portrait/identity header,
// a separately authenticated safe projection of Eve's loaded configuration,
// the accepted self-model, two memory panes (accepted vs. unmistakably pending
// candidates), and the session list (ephemera in the persona's life, not its
// identity).
//
// Privacy constraint: relationship-kind memory records
// render as SHAPE ONLY — kind + subject-class + relative time — never
// quoted content, in every pane, regardless of viewer. See shapeOfRecord().

import { createContext, useContext, useState, type ReactNode } from "react"
import { formatDistanceToNow } from "date-fns"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ArchiveIcon,
  CheckIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { LED } from "@workspace/ui/components/instrument/led"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  useAgentMemoryActions,
  useAgentProfile,
  useAgentPublicProfile,
  useUpdateAgentPersona,
  useUploadAgentPortrait,
  type AgentMemoryRecord,
  type AgentProfile as AgentProfileData,
} from "@/lib/agent-profile"
import { AgentPortrait } from "@/components/agents/agent-portrait"
import {
  useAgentRuntimeCatalog,
  type AgentCatalog,
  type AgentSubagentCatalogItem,
} from "@/lib/agent-catalog"
import {
  useAgentThreads,
  useCreateAgentThread,
  type AgentThreadSummary,
} from "@/lib/agent-threads"

// ─── Root / context ─────────────────────────────────────────────────────────

interface AgentProfileContextValue {
  profile: AgentProfileData
}

const Ctx = createContext<AgentProfileContextValue | null>(null)

function useProfile() {
  const ctx = useContext(Ctx)
  if (!ctx)
    throw new Error(
      "AgentProfile parts must be used inside <AgentProfile.Root>",
    )
  return ctx.profile
}

function Root({
  profile,
  children,
  className,
}: {
  profile: AgentProfileData
  children: ReactNode
  className?: string
}) {
  return (
    <Ctx.Provider value={{ profile }}>
      <div
        data-slot="agent-profile"
        className={cn("mx-auto flex max-w-3xl flex-col gap-8 p-6", className)}
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}

// ─── Header: portrait, name, identity summary, lineage chip ────────────────

function Header({ className }: { className?: string }) {
  const { persona, hasPortrait, lineage } = useProfile()
  const createThread = useCreateAgentThread()
  const navigate = useNavigate()
  const personaName = persona.name ?? persona.id

  return (
    <header
      data-slot="agent-profile-header"
      className={cn("flex items-start gap-5", className)}
    >
      <AgentPortrait
        personaId={persona.id}
        name={personaName}
        hasPortrait={hasPortrait}
        className="size-20"
        fallbackClassName="text-2xl font-medium text-primary"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        <h1 className="truncate text-xl font-semibold">
          {persona.name ?? persona.id}
        </h1>
        {persona.description && (
          <p className="text-sm text-muted-foreground">{persona.description}</p>
        )}
        {/* Badge's base classes are shrink-0 + w-fit (fine for short labels);
            this lineage string is long enough to overflow a narrow column,
            so shrink + max-w-full + truncate override that to ellipsize
            instead of clipping past the viewport edge (375px finding). */}
        <Badge
          variant="outline"
          className="mt-1 min-w-0 max-w-full shrink truncate font-mono text-[10px] text-muted-foreground"
        >
          {lineage.authoredBaseId} · rev {lineage.policyRevision}
        </Badge>
        <Button
          className="mt-2 w-fit"
          disabled={createThread.isPending}
          onClick={() =>
            createThread.mutate(
              { personaId: persona.id },
              { onSuccess: () => void navigate({ to: "/chat" }) },
            )
          }
          size="sm"
        >
          <MessageSquarePlusIcon />
          Start conversation
        </Button>
      </div>
    </header>
  )
}

// ─── Identity: deliberate, owner-authenticated persona editing ────────────

function Identity({ className }: { className?: string }) {
  const { persona, hasPortrait } = useProfile()
  const update = useUpdateAgentPersona(persona.id)
  const upload = useUploadAgentPortrait(persona.id)
  const [name, setName] = useState(persona.name ?? "")
  const [description, setDescription] = useState(persona.description ?? "")
  const [systemPrompt, setSystemPrompt] = useState(persona.systemPrompt ?? "")

  const dirty =
    name !== (persona.name ?? "") ||
    description !== (persona.description ?? "") ||
    systemPrompt !== (persona.systemPrompt ?? "")
  const canSave = name.trim().length > 0 && dirty

  function saveIdentity() {
    if (!canSave) return
    update.mutate(
      { name, description, systemPrompt },
      {
        onSuccess: (profile) => {
          setName(profile.persona.name ?? "")
          setDescription(profile.persona.description ?? "")
          setSystemPrompt(profile.persona.systemPrompt ?? "")
          toast.success("Persona identity updated.")
        },
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update persona identity.",
          ),
      },
    )
  }

  function uploadPortrait(file: File | undefined) {
    if (!file) return
    upload.mutate(file, {
      onSuccess: () => toast.success("Portrait updated."),
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not update portrait.",
        ),
    })
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <p className="text-xs text-muted-foreground">
          This is the persona record the next session wakes with. It does not
          rewrite an active session.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Description</span>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1_000}
            className="min-h-20 resize-y"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Instructions</span>
          <Textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            maxLength={12_000}
            className="min-h-40 resize-y font-mono text-xs"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <UploadIcon className="size-4 shrink-0" />
            <span className="truncate">
              {hasPortrait ? "Replace portrait" : "Add portrait"}
            </span>
            <Input
              type="file"
              accept="image/png"
              disabled={upload.isPending}
              className="max-w-52 text-xs"
              onChange={(event) => uploadPortrait(event.target.files?.[0])}
            />
          </label>
          <Button
            size="sm"
            onClick={saveIdentity}
            disabled={!canSave || update.isPending}
          >
            <PencilIcon />
            {update.isPending ? "Saving…" : "Save identity"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Scoped skills: honest route to the currently available manager ────────

function Skills({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Scoped skills</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 px-4">
        <p className="max-w-xl text-sm text-muted-foreground">
          Eve binds persona-scoped skills from trusted session context. The
          shared Skills workspace manages application-wide scopes; persona
          skills are resolved when this agent runs.
        </p>
        <Button size="sm" variant="outline" render={<Link to="/skills" />}>
          Manage skills
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Self-model: accepted claims from the identity floor ───────────────────

function SelfModel({ className }: { className?: string }) {
  const { selfClaims } = useProfile()

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Self-model</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {selfClaims.length === 0 ? (
          <EmptyState>
            No accepted self-claims yet — the floor is still empty.
          </EmptyState>
        ) : (
          selfClaims.map((record) => (
            <ClaimRow key={record.id} record={record} />
          ))
        )}
      </CardContent>
    </Card>
  )
}

// ─── Loaded configuration: safe Eve inspection projection ─────────────────

export function AgentConfiguration({
  catalog,
  className,
}: {
  catalog: AgentCatalog
  className?: string
}) {
  const instructions = catalog.agent.instructions

  return (
    <Card data-slot="agent-configuration" className={className}>
      <CardHeader>
        <CardTitle>Loaded configuration</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border px-4">
        <section className="grid gap-4 pb-4 sm:grid-cols-2">
          <ConfigurationValue label="Model">
            <span className="font-mono text-xs">
              {catalog.agent.model ?? "Not reported"}
            </span>
          </ConfigurationValue>
          <ConfigurationValue label="Instructions">
            <span>
              {instructions.loaded ? instructions.name : "Not loaded"}
            </span>
            {instructions.loaded && (
              <span className="text-xs text-muted-foreground">
                {instructions.lines}{" "}
                {instructions.lines === 1 ? "line" : "lines"}
                {instructions.dynamicResolvers > 0 &&
                  ` · ${instructions.dynamicResolvers} dynamic`}
              </span>
            )}
          </ConfigurationValue>
        </section>

        <ConfigurationList
          count={catalog.connections.length}
          empty="No connections loaded."
          label="Connections"
        >
          {catalog.connections.map((connection) => (
            <div
              key={connection.id}
              className="flex items-start justify-between gap-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {connection.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {connection.description}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {connection.protocol}
              </span>
            </div>
          ))}
        </ConfigurationList>

        <ConfigurationList
          count={catalog.subagents.length}
          empty="No subagents loaded."
          label="Subagents"
        >
          {catalog.subagents.map((subagent) => (
            <div key={subagent.id} className="py-2.5">
              <p className="text-sm font-medium text-foreground">
                {subagent.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {subagent.description}
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {subagentCapabilitySummary(subagent)}
              </p>
            </div>
          ))}
        </ConfigurationList>
      </CardContent>
    </Card>
  )
}

function Configuration({ className }: { className?: string }) {
  const catalog = useAgentRuntimeCatalog()

  if (catalog.isPending) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="size-3.5" /> Loading configuration…
        </CardContent>
      </Card>
    )
  }

  if (catalog.isError) {
    return (
      <Card className={className}>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loaded configuration is unavailable right now.
        </CardContent>
      </Card>
    )
  }

  return <AgentConfiguration catalog={catalog.data} className={className} />
}

function ConfigurationValue({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col text-sm text-foreground">{children}</div>
    </div>
  )
}

function ConfigurationList({
  children,
  count,
  empty,
  label,
}: {
  children: ReactNode
  count: number
  empty: string
  label: string
}) {
  return (
    <section className="py-4 last:pb-0">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
        <span className="font-mono text-[10px] text-muted-foreground">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border/60">{children}</div>
      )}
    </section>
  )
}

function subagentCapabilitySummary(subagent: AgentSubagentCatalogItem) {
  const summary = subagent.summary
  return [
    summary.instructions ? "instructions loaded" : "no instructions",
    `${summary.skills} ${summary.skills === 1 ? "skill" : "skills"}`,
    `${summary.tools} ${summary.tools === 1 ? "tool" : "tools"}`,
    `${summary.connections} ${summary.connections === 1 ? "connection" : "connections"}`,
  ].join(" · ")
}

function ClaimRow({ record }: { record: AgentMemoryRecord }) {
  const shape = shapeOfRecord(record)
  return (
    <div className="flex items-start gap-2 border-b border-border/50 pb-3 text-sm last:border-0 last:pb-0">
      <KindChip kind={record.kind} />
      <p className="text-foreground">{shape ?? record.content}</p>
    </div>
  )
}

// ─── Memory: accepted + candidate panes ─────────────────────────────────────

function Memory({ className }: { className?: string }) {
  const { memory, persona } = useProfile()
  const actions = useAgentMemoryActions(persona.id)

  return (
    <div
      data-slot="agent-profile-memory"
      className={cn("grid gap-4 sm:grid-cols-2", className)}
    >
      <Card>
        <CardHeader>
          <CardTitle>Accepted memory</CardTitle>
          <p className="text-xs text-muted-foreground">
            {memory.accepted.length} record
            {memory.accepted.length === 1 ? "" : "s"}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          {memory.accepted.length === 0 ? (
            <EmptyState>No accepted memories yet — it's early.</EmptyState>
          ) : (
            memory.accepted
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 6)
              .map((record) => (
                <MemoryRow
                  key={record.id}
                  record={record}
                  onArchive={() => archiveMemory(record.id)}
                  onCorrect={(content) => correctMemory(record.id, content)}
                  busy={actions.archive.isPending || actions.correct.isPending}
                />
              ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates</CardTitle>
          <p className="text-xs text-muted-foreground">
            {memory.candidates.length} awaiting review
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          {memory.candidates.length === 0 ? (
            <EmptyState>
              Nothing pending — the agent hasn't proposed anything new.
            </EmptyState>
          ) : (
            memory.candidates
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((record) => (
                <MemoryRow
                  key={record.id}
                  record={record}
                  candidate
                  onAccept={() => acceptMemory(record.id)}
                  busy={actions.accept.isPending}
                />
              ))
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Candidate rejection and multi-record consolidation are not yet
              available in the current memory lifecycle.
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled
              title="Record consolidation is not currently available."
            >
              Consolidate unavailable
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  function acceptMemory(recordId: string) {
    actions.accept.mutate(recordId, {
      onSuccess: () => toast.success("Memory accepted."),
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not accept memory.",
        ),
    })
  }

  function archiveMemory(recordId: string) {
    actions.archive.mutate(recordId, {
      onSuccess: () => toast.success("Memory archived."),
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not archive memory.",
        ),
    })
  }

  function correctMemory(recordId: string, content: string) {
    actions.correct.mutate(
      { recordId, content },
      {
        onSuccess: () => toast.success("Memory corrected."),
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not correct memory.",
          ),
      },
    )
  }
}

function MemoryRow({
  record,
  candidate = false,
  busy = false,
  onAccept,
  onArchive,
  onCorrect,
}: {
  record: AgentMemoryRecord
  candidate?: boolean
  busy?: boolean
  onAccept?: () => void
  onArchive?: () => void
  onCorrect?: (content: string) => void
}) {
  const shape = shapeOfRecord(record)
  const relationshipRecord = record.kind === "relationship"
  const [isCorrecting, setIsCorrecting] = useState(false)
  const [content, setContent] = useState(record.content)
  const canCorrect = content.trim().length > 0 && content !== record.content

  function saveCorrection() {
    if (!canCorrect || !onCorrect) return
    onCorrect(content)
    setIsCorrecting(false)
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border/60 pb-3 text-sm last:border-0 last:pb-0",
        candidate &&
          "border-l-2 border-dashed border-muted-foreground/40 pl-3 text-muted-foreground",
      )}
    >
      <div className="flex items-center gap-2">
        <KindChip kind={record.kind} />
        <span className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(record.updatedAt, { addSuffix: true })}
        </span>
        {candidate && (
          <Badge
            variant="outline"
            className="ml-auto text-[9px] text-muted-foreground"
          >
            awaiting review
          </Badge>
        )}
      </div>
      {isCorrecting && !relationshipRecord ? (
        <>
          <Textarea
            aria-label="Correct memory"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-20 resize-y text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCorrecting(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveCorrection}
              disabled={!canCorrect || busy}
            >
              Save correction
            </Button>
          </div>
        </>
      ) : (
        <p className={cn(!candidate && "text-foreground")}>
          {shape ?? record.content}
        </p>
      )}
      {!isCorrecting && candidate && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onAccept} disabled={!onAccept || busy}>
            <CheckIcon />
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled
            title="Candidate rejection is not available in the current memory lifecycle."
          >
            Reject unavailable
          </Button>
        </div>
      )}
      {!isCorrecting && !candidate && (
        <div className="flex flex-wrap items-center gap-2">
          {!relationshipRecord && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCorrecting(true)}
              disabled={!onCorrect || busy}
            >
              <PencilIcon />
              Correct
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onArchive}
            disabled={!onArchive || busy}
          >
            <ArchiveIcon />
            Archive
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Sessions: current + recent Eve sessions bound to this persona ─────────

function Sessions({ className }: { className?: string }) {
  const { persona } = useProfile()
  const threadsQuery = useAgentThreads(true)
  const threads = threadsQuery.data?.filter(
    (thread) => thread.personaId === persona.id,
  )

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        {threadsQuery.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-3.5" /> Loading sessions…
          </div>
        ) : threadsQuery.isError ? (
          <EmptyState>Sessions are unavailable right now.</EmptyState>
        ) : threads?.length === 0 ? (
          <EmptyState>No sessions yet — nobody has talked to it.</EmptyState>
        ) : (
          (threads ?? [])
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 8)
            .map((thread) => <SessionRow key={thread.id} thread={thread} />)
        )}
      </CardContent>
    </Card>
  )
}

function SessionRow({ thread }: { thread: AgentThreadSummary }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border/50 py-2 text-sm last:border-0">
      <LED
        color={
          thread.status === "active"
            ? "var(--color-success)"
            : "var(--color-muted-foreground)"
        }
        isOn
        size={6}
      />
      <span className="min-w-0 flex-1 truncate">{thread.title}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: true })}
      </span>
    </div>
  )
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function KindChip({ kind }: { kind: AgentMemoryRecord["kind"] }) {
  return (
    <Badge
      variant="outline"
      className="shrink-0 text-muted-foreground capitalize"
    >
      {kind}
    </Badge>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

/** Relationship-kind records never render their content — kind + subject
 *  class + relative time only. Returns null for every other kind (caller
 *  falls back to record.content). */
function shapeOfRecord(record: AgentMemoryRecord): string | null {
  if (record.kind !== "relationship") return null
  return `Knows something about a ${record.subject.kind} — ${formatDistanceToNow(record.updatedAt, { addSuffix: true })}.`
}

// ─── Top-level view (data fetching + loading/error states) ─────────────────

export function AgentProfileView({
  owner,
  personaId,
}: {
  /** Whether the viewer owns this agent — selects the full vs reduced
   *  projection (§4.3). The roster links every persona here, so the
   *  destination adapts to role instead of dead-ending. */
  owner: boolean
  personaId: string
}) {
  if (!owner) return <PublicAgentProfileView personaId={personaId} />
  return <OwnerAgentProfileView personaId={personaId} />
}

function OwnerAgentProfileView({ personaId }: { personaId: string }) {
  const { data, isPending, isError, error } = useAgentProfile(personaId)

  if (isPending) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading agent profile…
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Agent profile unavailable</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "The agent profile could not be loaded."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <AgentProfile.Root profile={data}>
      <AgentProfile.Header />
      <AgentProfile.Identity />
      <AgentProfile.Configuration />
      <AgentProfile.Skills />
      <AgentProfile.SelfModel />
      <AgentProfile.Memory />
      <AgentProfile.Sessions />
    </AgentProfile.Root>
  )
}

// §4.3 — the reduced projection a non-owner sees: identity + description +
// portrait. Memory, sessions, and configuration stay owner-only (the Q1
// relationship-memory model is a follow-up spec; this is the no-dead-end
// floor — a member reaching /agents/$personaId from the roster always lands
// on a real page, never a raw "Owner access required").
function PublicAgentProfileView({ personaId }: { personaId: string }) {
  const { data, isPending, isError, error } = useAgentPublicProfile(personaId)

  if (isPending) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading agent profile…
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Agent not found</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "This agent isn't visible to you."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="flex items-start gap-4">
        <AgentPortrait
          personaId={data.id}
          name={data.name}
          hasPortrait={data.hasPortrait}
          className="size-16"
          fallbackClassName="text-xl font-medium text-primary"
        />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-medium">{data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.description || "No description."}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Memory, sessions, and configuration are visible to this agent's
            owner.
          </p>
        </div>
      </div>
    </div>
  )
}

export const AgentProfile = {
  Root,
  Header,
  Identity,
  Configuration,
  Skills,
  SelfModel,
  Memory,
  Sessions,
}
