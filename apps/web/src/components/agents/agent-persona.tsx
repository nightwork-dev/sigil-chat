// AgentPersona — how a persona introduces itself, wherever it appears.
//
// Five surfaces render the same identity: the agent list card, the persona
// picker in the chat header, the hover card on a home row, the profile
// header, and the profile's own preview. Each had rebuilt portrait + name +
// supporting line by hand, which is how the supporting line ended up meaning
// three different things — a description here, a headline there, the raw id
// somewhere else, with a different fallback each time.
//
// App-domain, deliberately: a persona is sigil-chat's own object. The
// portrait resolves from a personaId through this app's portrait route, and
// "show the id when there is nothing to say" is this product's answer to an
// empty description, not a general one. The generic half — an avatar with an
// image and an initial fallback — is already Avatar in packages/ui, which is
// what AgentPortrait wraps.

import { createContext, useContext, type ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { AgentPortrait } from "@/components/agents/agent-portrait"

/** Display shape, not a store type — callers adapt their own row into it. */
export interface AgentPersonaIdentity {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly hasPortrait: boolean
}

const Ctx = createContext<AgentPersonaIdentity | null>(null)

function usePersona(): AgentPersonaIdentity {
  const persona = useContext(Ctx)
  if (!persona) {
    throw new Error(
      "AgentPersona parts must be used inside <AgentPersona.Root>",
    )
  }
  return persona
}

function Root({
  persona,
  children,
  className,
}: {
  persona: AgentPersonaIdentity
  children: ReactNode
  className?: string
}) {
  return (
    <Ctx.Provider value={persona}>
      <div
        data-slot="agent-persona"
        className={cn("flex items-start gap-3", className)}
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}

function Portrait({
  size,
  className,
  fallbackClassName,
}: {
  size?: "sm" | "default" | "lg"
  className?: string
  fallbackClassName?: string
}) {
  const persona = usePersona()
  return (
    <AgentPortrait
      personaId={persona.id}
      name={persona.name}
      hasPortrait={persona.hasPortrait}
      size={size}
      className={className}
      fallbackClassName={fallbackClassName}
    />
  )
}

/** The block a portrait sits beside — name, supporting line, id. */
function Body({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="agent-persona-body"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
    >
      {children}
    </div>
  )
}

function Name({
  as: Tag = "span",
  className,
}: {
  as?: "span" | "h1" | "h2" | "p"
  className?: string
}) {
  const persona = usePersona()
  return (
    <Tag
      data-slot="agent-persona-name"
      className={cn("truncate font-medium", className)}
    >
      {persona.name}
    </Tag>
  )
}

/**
 * The one supporting line under the name.
 *
 * `fallback="id"` is the list-and-picker rule: a persona with nothing written
 * about it still needs something under its name, and its id is the only thing
 * always true. Omit the fallback where an absent line should simply be absent.
 */
function Description({
  fallback,
  className,
}: {
  fallback?: "id"
  className?: string
}) {
  const persona = usePersona()
  const text =
    persona.description || (fallback === "id" ? persona.id : undefined)
  if (!text) return null
  return (
    <p
      data-slot="agent-persona-description"
      className={cn("text-sm text-muted-foreground", className)}
    >
      {text}
    </p>
  )
}

/** The persona's stable handle, shown where the name alone is ambiguous. */
function Id({ className }: { className?: string }) {
  const persona = usePersona()
  return (
    <p
      data-slot="agent-persona-id"
      className={cn(
        "truncate font-mono text-[10px] text-muted-foreground",
        className,
      )}
    >
      {persona.id}
    </p>
  )
}

export const AgentPersona = { Root, Portrait, Body, Name, Description, Id }
