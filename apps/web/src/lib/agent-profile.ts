// Client-safe: types, the server-fn wrapper, and React Query hooks. All
// server-only construction (PersonaRegistry, EveMemoryHost, the memory
// store — real filesystem access via @gonk/scope) lives in
// agent-profile.server.ts and is imported dynamically, inside the handler
// only, so none of it reaches the client bundle. See agent-threads.ts for
// the same split in this codebase; DO NOT import agent-profile.server at
// module scope here — Vite will try to bundle node:fs/node:path for the
// browser and the build fails.

import { createServerFn } from "@tanstack/react-start"
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type { MemoryRecord } from "@gonk/memory"
import type { ResolvedPersona } from "@gonk/persona"
import type { SigilAuthSession } from "./auth/server"
import { useAgentPrincipalId } from "./agent-principal"

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
  hasPortrait: boolean
}

export interface AgentPersonaUpdateInput {
  personaId: string
  name: string
  description: string
  systemPrompt: string
}

export interface AgentMemoryCorrectionInput {
  personaId: string
  recordId: string
  content: string
}

export interface AgentMemoryRecordInput {
  personaId: string
  recordId: string
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
    const assertOwner: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireOwner
    assertOwner(session)
    return loadAgentProfile(session.user.id, personaId)
  })

export const listPersonas = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgentPersonaSummary[]> => {
    const { getSession, requireSession } = await import("./auth/session")
    const { listAgentPersonas } = await import("./agent-profile.server")

    const session = await getSession()
    const assertSession: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireSession
    assertSession(session)
    return listAgentPersonas()
  },
)

export const updateAgentPersona = createServerFn({ method: "POST" })
  .validator((input: AgentPersonaUpdateInput) => validatePersonaUpdate(input))
  .handler(async ({ data }): Promise<AgentProfile> => {
    const { getSession, requireOwner } = await import("./auth/session")
    const { updateAgentPersonaProfile } = await import("./agent-profile.server")

    const session = await getSession()
    const assertOwner: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireOwner
    assertOwner(session)
    return updateAgentPersonaProfile(session.user.id, data)
  })

const uploadAgentPortrait = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<AgentProfile> => {
    const personaId = data.get("personaId")
    const file = data.get("file")
    if (typeof personaId !== "string" || personaId.trim().length === 0) {
      throw new Error("Portrait upload requires a persona id.")
    }
    if (!(file instanceof File)) {
      throw new Error("Portrait upload requires an image file.")
    }
    if (file.type !== "image/png") {
      throw new Error("Portraits must be PNG images.")
    }
    if (file.size === 0) throw new Error("Portrait image is empty.")
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Portrait image exceeds the 5 MB limit.")
    }

    const { getSession, requireOwner } = await import("./auth/session")
    const { writeAgentPortrait } = await import("./agent-profile.server")

    const session = await getSession()
    const assertOwner: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireOwner
    assertOwner(session)
    return writeAgentPortrait(
      session.user.id,
      personaId.trim(),
      new Uint8Array(await file.arrayBuffer()),
    )
  })

export const acceptAgentMemory = createServerFn({ method: "POST" })
  .validator((input: AgentMemoryRecordInput) =>
    validateMemoryRecordInput(input),
  )
  .handler(async ({ data }): Promise<AgentProfile> => {
    const { getSession, requireOwner } = await import("./auth/session")
    const { acceptAgentMemoryCandidate } =
      await import("./agent-profile.server")

    const session = await getSession()
    const assertOwner: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireOwner
    assertOwner(session)
    return acceptAgentMemoryCandidate(
      session.user.id,
      data.personaId,
      data.recordId,
    )
  })

export const archiveAgentMemory = createServerFn({ method: "POST" })
  .validator((input: AgentMemoryRecordInput) =>
    validateMemoryRecordInput(input),
  )
  .handler(async ({ data }): Promise<AgentProfile> => {
    const { getSession, requireOwner } = await import("./auth/session")
    const { archiveAgentMemoryRecord } = await import("./agent-profile.server")

    const session = await getSession()
    const assertOwner: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireOwner
    assertOwner(session)
    return archiveAgentMemoryRecord(
      session.user.id,
      data.personaId,
      data.recordId,
    )
  })

export const correctAgentMemory = createServerFn({ method: "POST" })
  .validator((input: AgentMemoryCorrectionInput) =>
    validateMemoryCorrection(input),
  )
  .handler(async ({ data }): Promise<AgentProfile> => {
    const { getSession, requireOwner } = await import("./auth/session")
    const { correctAgentMemoryRecord } = await import("./agent-profile.server")

    const session = await getSession()
    const assertOwner: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireOwner
    assertOwner(session)
    return correctAgentMemoryRecord(session.user.id, data)
  })

// ─── React Query (house pattern: key factory + hooks) ──────────────────────

export const agentProfileKeys = {
  all: () => ["agent-profile"] as const,
  roster: (principalId: string) =>
    [...agentProfileKeys.all(), principalId, "roster"] as const,
  detail: (principalId: string, personaId: string) =>
    [...agentProfileKeys.all(), principalId, personaId] as const,
}

export function agentProfileQueryOptions(
  principalId: string,
  personaId: string,
) {
  return queryOptions({
    queryKey: agentProfileKeys.detail(principalId, personaId),
    queryFn: () => fetchAgentProfile({ data: personaId }),
  })
}

export function agentRosterQueryOptions(principalId: string) {
  return queryOptions({
    queryKey: agentProfileKeys.roster(principalId),
    queryFn: () => listPersonas(),
  })
}

export function useAgentProfile(personaId: string) {
  const principalId = useAgentPrincipalId()
  return useQuery(agentProfileQueryOptions(principalId, personaId))
}

export function useAgentRoster() {
  const principalId = useAgentPrincipalId()
  return useQuery(agentRosterQueryOptions(principalId))
}

export function useInvalidateAgentProfile(personaId: string) {
  const qc = useQueryClient()
  const principalId = useAgentPrincipalId()
  return () =>
    qc.invalidateQueries({
      queryKey: agentProfileKeys.detail(principalId, personaId),
    })
}

export function useUpdateAgentPersona(personaId: string) {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (input: Omit<AgentPersonaUpdateInput, "personaId">) =>
      updateAgentPersona({ data: { personaId, ...input } }),
    onSuccess: (profile) => {
      queryClient.setQueryData(
        agentProfileKeys.detail(principalId, personaId),
        profile,
      )
      void queryClient.invalidateQueries({
        queryKey: agentProfileKeys.roster(principalId),
      })
    },
  })
}

export function useUploadAgentPortrait(personaId: string) {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  return useMutation({
    mutationFn: (file: File) => {
      const data = new FormData()
      data.set("personaId", personaId)
      data.set("file", file)
      return uploadAgentPortrait({ data })
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(
        agentProfileKeys.detail(principalId, personaId),
        profile,
      )
      void queryClient.invalidateQueries({
        queryKey: agentProfileKeys.roster(principalId),
      })
    },
  })
}

export function useAgentMemoryActions(personaId: string) {
  const queryClient = useQueryClient()
  const principalId = useAgentPrincipalId()
  const applyProfile = (profile: AgentProfile) =>
    queryClient.setQueryData(
      agentProfileKeys.detail(principalId, personaId),
      profile,
    )

  return {
    accept: useMutation({
      mutationFn: (recordId: string) =>
        acceptAgentMemory({ data: { personaId, recordId } }),
      onSuccess: applyProfile,
    }),
    archive: useMutation({
      mutationFn: (recordId: string) =>
        archiveAgentMemory({ data: { personaId, recordId } }),
      onSuccess: applyProfile,
    }),
    correct: useMutation({
      mutationFn: ({
        recordId,
        content,
      }: Omit<AgentMemoryCorrectionInput, "personaId">) =>
        correctAgentMemory({ data: { personaId, recordId, content } }),
      onSuccess: applyProfile,
    }),
  }
}

function validatePersonaUpdate(
  input: AgentPersonaUpdateInput,
): AgentPersonaUpdateInput {
  if (!isNonBlankString(input.personaId))
    throw new Error("Persona id is required.")
  if (!isNonBlankString(input.name))
    throw new Error("Persona name is required.")
  if (input.name.length > 120)
    throw new Error("Persona name exceeds 120 characters.")
  if (input.description.length > 1_000)
    throw new Error("Persona description exceeds 1,000 characters.")
  if (input.systemPrompt.length > 12_000)
    throw new Error("Persona instructions exceed 12,000 characters.")
  return {
    personaId: input.personaId.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    systemPrompt: input.systemPrompt.trim(),
  }
}

function validateMemoryRecordInput(
  input: AgentMemoryRecordInput,
): AgentMemoryRecordInput {
  if (!isNonBlankString(input.personaId) || !isNonBlankString(input.recordId)) {
    throw new Error("Persona and memory record ids are required.")
  }
  return { personaId: input.personaId.trim(), recordId: input.recordId.trim() }
}

function validateMemoryCorrection(
  input: AgentMemoryCorrectionInput,
): AgentMemoryCorrectionInput {
  const base = validateMemoryRecordInput(input)
  if (!isNonBlankString(input.content))
    throw new Error("Corrected memory must not be blank.")
  if (input.content.length > 4_000)
    throw new Error("Corrected memory exceeds 4,000 characters.")
  return { ...base, content: input.content.trim() }
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}
