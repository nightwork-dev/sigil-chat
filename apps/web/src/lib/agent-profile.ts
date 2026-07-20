// Client-safe: types, the server-fn wrapper, and React Query hooks. All
// server-only construction (PersonaRegistry, EveMemoryHost, the memory
// store — real filesystem access via @gonk/scope) lives in
// agent-profile.server.ts and is imported dynamically, inside the handler
// only, so none of it reaches the client bundle. See agent-threads.ts for
// the same split in this codebase; DO NOT import agent-profile.server at
// module scope here — Vite will try to bundle node:fs/node:path for the
// browser and the build fails.

import { createServerFn } from "@tanstack/react-start"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import type { MemoryRecord } from "@gonk/memory"
import type { ResolvedPersona } from "@gonk/persona"
import type { SigilAuthSession } from "./auth/server"

export interface AgentMemoryPane {
  accepted: MemoryRecord[]
  candidates: MemoryRecord[]
}

export interface AgentProfile {
  persona: ResolvedPersona
  /** The authored base this persona's identity floor is pinned to, and the
   *  floor policy revision it woke on this read — the lineage chip's two
   *  load-bearing fields. Derived-from/detached fields don't exist on
   *  `Persona` yet, so the chip renders base+revision alone. */
  lineage: { authoredBaseId: string; policyRevision: string }
  /** Whether the persona registry has a portrait blob on disk. The view
   *  fetches the image itself from /api/agent-portrait; this is just the
   *  presence flag so it knows whether to attempt that or fall back to the
   *  initial-glyph. */
  hasPortrait: boolean
  /** Accepted self-claims the persona holds about itself (the self-model). */
  selfClaims: MemoryRecord[]
  memory: AgentMemoryPane
}

export interface AgentPersonaSummary {
  id: string
  name: string
  description: string
}

export const fetchAgentProfile = createServerFn({ method: "GET" })
  .validator((personaId: string) => personaId)
  .handler(async ({ data: personaId }): Promise<AgentProfile> => {
    // Owner-only: the profile is the owner viewing their deployed agent's
    // memory. The principal is resolved server-side (never client-supplied).
    const { getSession, requireOwner } = await import("./auth/session")
    const { loadAgentProfile } = await import("./agent-profile.server")

    const session = await getSession()
    // TS assertion functions narrow only through a statically-typed
    // reference — a destructured dynamic import doesn't qualify (TS2775).
    // Re-bind with the explicit `asserts` signature, as agent-threads.ts
    // does for the equivalent requireSession call.
    const assertOwner: (candidate: SigilAuthSession | null) => asserts candidate is SigilAuthSession = requireOwner
    assertOwner(session)
    return loadAgentProfile(session.user.id, personaId)
  })

export const listPersonas = createServerFn({ method: "GET" }).handler(async (): Promise<AgentPersonaSummary[]> => {
  const { getSession, requireSession } = await import("./auth/session")
  const { listAgentPersonas } = await import("./agent-profile.server")

  const session = await getSession()
  const assertSession: (candidate: SigilAuthSession | null) => asserts candidate is SigilAuthSession = requireSession
  assertSession(session)
  return listAgentPersonas()
})

// ─── React Query (house pattern: key factory + hooks) ──────────────────────

export const agentProfileKeys = {
  all: () => ["agent-profile"] as const,
  roster: (principalId: string) => [...agentProfileKeys.all(), principalId, "roster"] as const,
  detail: (principalId: string, personaId: string) => [...agentProfileKeys.all(), principalId, personaId] as const,
}

export function agentProfileQueryOptions(personaId: string) {
  return queryOptions({
    queryKey: agentProfileKeys.detail("owner", personaId),
    queryFn: () => fetchAgentProfile({ data: personaId }),
  })
}

export function agentRosterQueryOptions() {
  return queryOptions({
    queryKey: agentProfileKeys.roster("owner"),
    queryFn: () => listPersonas(),
  })
}

export function useAgentProfile(personaId: string) {
  return useQuery(agentProfileQueryOptions(personaId))
}

export function useAgentRoster() {
  return useQuery(agentRosterQueryOptions())
}

export function useInvalidateAgentProfile(personaId: string) {
  const qc = useQueryClient()
  return () =>
    qc.invalidateQueries({
      queryKey: agentProfileKeys.detail("owner", personaId),
    })
}
