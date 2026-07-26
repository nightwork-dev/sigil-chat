"use client"

import { KeyRoundIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import type { CapabilityManifest } from "@workspace/agent-contracts/capability-manifest"
import { useCapabilityManifest } from "@/lib/agent-capability-manifest"

// The plain-language face of the capability manifest. It renders exactly the
// manifest the agent is given, so the answer a user reads here and the answer
// the agent gives are one and the same. It reports capability; it never grants
// it — every tool is re-authorized when it actually runs.

export function AgentAccessControl({ threadId }: { threadId: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs">
            <KeyRoundIcon className="size-3.5" />
            Access
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 gap-3">
        <PopoverHeader>
          <PopoverTitle>What this agent can access</PopoverTitle>
          <PopoverDescription>
            Reconstructed by the server for this conversation — the same account
            the agent itself is given.
          </PopoverDescription>
        </PopoverHeader>
        <AccessBody threadId={threadId} />
      </PopoverContent>
    </Popover>
  )
}

function AccessBody({ threadId }: { threadId: string }) {
  const query = useCapabilityManifest(threadId)

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Spinner className="size-3.5" /> Reading this session…
      </p>
    )
  }
  if (query.isError || !query.data) {
    return (
      <p className="text-muted-foreground">
        This session’s access could not be read right now.
      </p>
    )
  }

  return <ManifestReadout manifest={query.data} />
}

function ManifestReadout({ manifest }: { manifest: CapabilityManifest }) {
  const { host, identity, visibility, actions, continuity, modality } = manifest

  return (
    <div className="flex flex-col gap-3">
      <Section title="Who you’re talking to">
        <Row label="Agent">
          {host.label}
          {host.model ? (
            <span className="text-muted-foreground"> · {host.model}</span>
          ) : null}
        </Row>
        <Row label="Persona">
          <Mono>{identity.personaId}</Mono>
        </Row>
        <Row label="Conversation">
          <Mono>{identity.applicationThreadId}</Mono>
        </Row>
      </Section>

      <Separator />

      <Section title="What it can see">
        <Row label="Working in">
          <Mono>{visibility.activeScope}</Mono>
        </Row>
        <Row label="Can also read">
          {visibility.readableContextScopes.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {visibility.readableContextScopes.map((scope) => (
                <Mono key={scope}>{scope}</Mono>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Nothing beyond the active scope
            </span>
          )}
        </Row>
        <ContinuityLine continuity={continuity} />
        <p className="text-muted-foreground">
          What you select and where you are is shared as advisory focus, not as
          permission. You control that privacy level.
        </p>
      </Section>

      <Separator />

      <Section title="What it can change">
        <p className={cn(actions.mutationsAllowed ? "" : "text-muted-foreground")}>
          {actions.mutationsAllowed
            ? "It can make changes in this scope. Every action is re-checked when it runs."
            : "This scope is read-only for it. Change actions will be refused."}
        </p>
        {actions.tools.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              {actions.tools.length}{" "}
              {actions.tools.length === 1 ? "tool" : "tools"} available
            </span>
            <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {actions.tools.map((tool) => (
                <li key={tool.name} title={tool.description}>
                  {tool.label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">No tools are available here.</p>
        )}
      </Section>

      <Separator />

      <Section title="In a live voice call">
        <p className="text-muted-foreground">
          {modality.liveVoiceSharesTextChatState
            ? "A voice call shares this conversation’s state."
            : "A voice call is a separate, limited mode — it does not share this " +
              "conversation’s persona, memory, or tools."}
        </p>
      </Section>
    </div>
  )
}

function ContinuityLine({
  continuity,
}: {
  continuity: CapabilityManifest["continuity"]
}) {
  const carried = [
    continuity.durableMemory ? "durable memory" : null,
    continuity.sharedBlackboard ? "a shared note" : null,
  ].filter((entry): entry is string => entry !== null)

  return (
    <p className="text-muted-foreground">
      {carried.length > 0
        ? `Carries ${carried.join(" and ")} across turns.`
        : "Keeps only this conversation’s own history."}
    </p>
  )
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px]">{children}</span>
}
