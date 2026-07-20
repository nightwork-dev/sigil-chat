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

import { createContext, useContext, type ReactNode } from "react"
import { formatDistanceToNow } from "date-fns"
import { useNavigate } from "@tanstack/react-router"
import { MessageSquarePlusIcon } from "lucide-react"
import type { MemoryRecord } from "@gonk/memory"

import { cn } from "@workspace/ui/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { LED } from "@workspace/ui/components/instrument/led"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"
import { Button } from "@workspace/ui/components/button"

import { useAgentProfile, type AgentProfile as AgentProfileData } from "@/lib/agent-profile"
import { useAgentRuntimeCatalog, type AgentCatalog, type AgentSubagentCatalogItem } from "@/lib/agent-catalog"
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
  if (!ctx) throw new Error("AgentProfile parts must be used inside <AgentProfile.Root>")
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
      <div data-slot="agent-profile" className={cn("mx-auto flex max-w-3xl flex-col gap-8 p-6", className)}>
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
  const initial = (persona.name ?? persona.id).slice(0, 1).toUpperCase()

  return (
    <header data-slot="agent-profile-header" className={cn("flex items-start gap-5", className)}>
      <Avatar className="size-20">
        {hasPortrait && <AvatarImage src={`/api/agent-portrait?personaId=${encodeURIComponent(persona.id)}`} alt="" />}
        <AvatarFallback className="text-2xl font-medium text-primary">{initial}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        <h1 className="truncate text-xl font-semibold">{persona.name ?? persona.id}</h1>
        {persona.description && <p className="text-sm text-muted-foreground">{persona.description}</p>}
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
          <EmptyState>No accepted self-claims yet — the floor is still empty.</EmptyState>
        ) : (
          selfClaims.map((record) => <ClaimRow key={record.id} record={record} />)
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
            <span className="font-mono text-xs">{catalog.agent.model ?? "Not reported"}</span>
          </ConfigurationValue>
          <ConfigurationValue label="Instructions">
            <span>{instructions.loaded ? instructions.name : "Not loaded"}</span>
            {instructions.loaded && (
              <span className="text-xs text-muted-foreground">
                {instructions.lines} {instructions.lines === 1 ? "line" : "lines"}
                {instructions.dynamicResolvers > 0 && ` · ${instructions.dynamicResolvers} dynamic`}
              </span>
            )}
          </ConfigurationValue>
        </section>

        <ConfigurationList count={catalog.connections.length} empty="No connections loaded." label="Connections">
          {catalog.connections.map((connection) => (
            <div key={connection.id} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{connection.name}</p>
                <p className="text-sm text-muted-foreground">{connection.description}</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{connection.protocol}</span>
            </div>
          ))}
        </ConfigurationList>

        <ConfigurationList count={catalog.subagents.length} empty="No subagents loaded." label="Subagents">
          {catalog.subagents.map((subagent) => (
            <div key={subagent.id} className="py-2.5">
              <p className="text-sm font-medium text-foreground">{subagent.name}</p>
              <p className="text-sm text-muted-foreground">{subagent.description}</p>
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

function ConfigurationValue({ children, label }: { children: ReactNode; label: string }) {
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
        <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
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

function ClaimRow({ record }: { record: MemoryRecord }) {
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
  const { memory } = useProfile()

  return (
    <div data-slot="agent-profile-memory" className={cn("grid gap-4 sm:grid-cols-2", className)}>
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
              .map((record) => <MemoryRow key={record.id} record={record} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates</CardTitle>
          <p className="text-xs text-muted-foreground">{memory.candidates.length} awaiting review</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          {memory.candidates.length === 0 ? (
            <EmptyState>Nothing pending — the agent hasn't proposed anything new.</EmptyState>
          ) : (
            memory.candidates
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((record) => <MemoryRow key={record.id} record={record} candidate />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MemoryRow({ record, candidate = false }: { record: MemoryRecord; candidate?: boolean }) {
  const shape = shapeOfRecord(record)
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border border-border/60 p-2.5 text-sm",
        candidate && "border-dashed bg-muted/30 text-muted-foreground",
      )}
    >
      <div className="flex items-center gap-2">
        <KindChip kind={record.kind} />
        <span className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(record.updatedAt, { addSuffix: true })}
        </span>
        {candidate && (
          <Badge variant="outline" className="ml-auto text-[9px] text-muted-foreground">
            awaiting review
          </Badge>
        )}
      </div>
      <p className={cn(!candidate && "text-foreground")}>{shape ?? record.content}</p>
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
        color={thread.status === "active" ? "var(--color-success)" : "var(--color-muted-foreground)"}
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

function KindChip({ kind }: { kind: MemoryRecord["kind"] }) {
  return (
    <Badge variant="outline" className="shrink-0 text-muted-foreground capitalize">
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
function shapeOfRecord(record: MemoryRecord): string | null {
  if (record.kind !== "relationship") return null
  return `Knows something about a ${record.subject.kind} — ${formatDistanceToNow(record.updatedAt, { addSuffix: true })}.`
}

// ─── Top-level view (data fetching + loading/error states) ─────────────────

export function AgentProfileView({ personaId }: { personaId: string }) {
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
            {error instanceof Error ? error.message : "The agent profile could not be loaded."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <AgentProfile.Root profile={data}>
      <AgentProfile.Header />
      <AgentProfile.Configuration />
      <AgentProfile.SelfModel />
      <AgentProfile.Memory />
      <AgentProfile.Sessions />
    </AgentProfile.Root>
  )
}

export const AgentProfile = { Root, Header, Configuration, SelfModel, Memory, Sessions }
