// The capability manifest is the one authoritative answer to "who are you,
// what can you see, and what can you change?" for a single bound session. It
// is assembled here, in one place, from facts a server has already verified —
// never from anything a browser claims. Both the chat UI and the agent consume
// the output of `buildCapabilityManifest`, so the two surfaces cannot drift
// into two different stories about the same session.
//
// This module is host-neutral and client-safe: no Node built-ins, no I/O.
// Authority comes from WHERE the inputs are reconstructed, not from a signature
// on the output: the UI and the agent each rebuild the manifest server-side from
// the same authorities (verified session + signed execution binding + the one
// tool registry), so neither can be widened by a browser claim.

export const CAPABILITY_MANIFEST_VERSION = 1 as const

export type CapabilityManifestHostId = "eve" | "local-codex-realtime" | string

export interface CapabilityManifestHost {
  /** Stable id of the runtime answering — Eve, a local Codex realtime, etc. */
  id: CapabilityManifestHostId
  label: string
  model?: string
}

export interface CapabilityManifestTool {
  name: string
  label: string
  description: string
}

export interface CapabilityManifestIdentity {
  principalId: string
  personaId: string
  applicationThreadId: string
}

export interface CapabilityManifestVisibility {
  /** The scope the session acts within right now. */
  activeScope: string
  /** Additional scopes the principal may read from, active scope excluded. */
  readableContextScopes: string[]
}

export interface CapabilityManifestActions {
  tools: CapabilityManifestTool[]
  /**
   * Whether the active scope authorizes mutating tools for this principal.
   * Reporting `true` never grants access — every tool is re-authorized at
   * invocation against the verified scope regardless of this flag.
   */
  mutationsAllowed: boolean
}

export interface CapabilityManifestAttention {
  /** Client attention is advisory task focus; it is never an authorization. */
  delivery: "advisory"
  /** The context-privacy level is a user-controlled client preference. */
  privacyControlledBy: "user"
}

export interface CapabilityManifestContinuity {
  /** This conversation's transcript persists across turns and reconnects. */
  conversationPersists: boolean
  /** Audience-filtered durable memory may carry curated context across threads. */
  durableMemory: boolean
  /** A shared blackboard scratch space is available (session-tier scopes only). */
  sharedBlackboard: boolean
}

export interface CapabilityManifestModality {
  /** Whether a live voice call shares this text conversation's state. */
  liveVoiceSharesTextChatState: boolean
  /** Whether live voice is a separate, capability-limited experimental mode. */
  liveVoiceExperimental: boolean
}

export interface CapabilityManifest {
  version: typeof CAPABILITY_MANIFEST_VERSION
  host: CapabilityManifestHost
  identity: CapabilityManifestIdentity
  visibility: CapabilityManifestVisibility
  actions: CapabilityManifestActions
  attention: CapabilityManifestAttention
  continuity: CapabilityManifestContinuity
  modality: CapabilityManifestModality
  /** Server clock at build time (epoch seconds). */
  issuedAt: number
}

export interface BuildCapabilityManifestInput {
  host: CapabilityManifestHost
  identity: CapabilityManifestIdentity
  activeScope: string
  readableContextScopes?: readonly string[]
  tools?: readonly { name: string; description?: string }[]
  mutationsAllowed: boolean
  continuity: CapabilityManifestContinuity
  modality?: Partial<CapabilityManifestModality>
  issuedAt: number
}

const DEFAULT_MODALITY: CapabilityManifestModality = {
  // Today live voice opens a separate local Codex realtime thread that does not
  // share the Eve text conversation. Both defaults state that plainly rather
  // than overstating a binding that does not exist yet.
  liveVoiceSharesTextChatState: false,
  liveVoiceExperimental: true,
}

export function toCapabilityToolLabel(name: string): string {
  return name
    .replace(/^sigil-/u, "")
    .replaceAll(/[-_]/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase())
    .trim()
}

export function buildCapabilityManifest(
  input: BuildCapabilityManifestInput,
): CapabilityManifest {
  const activeScope = input.activeScope.trim()

  const readableContextScopes = dedupe(
    (input.readableContextScopes ?? [])
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0 && scope !== activeScope),
  )

  const tools = dedupeBy(
    (input.tools ?? []).flatMap((tool) => {
      const name = tool.name.trim()
      if (name.length === 0) return []
      return [
        {
          name,
          label: toCapabilityToolLabel(name),
          description: (tool.description ?? "").trim() || "Application tool",
        },
      ]
    }),
    (tool) => tool.name,
  ).sort((left, right) => left.label.localeCompare(right.label))

  return {
    version: CAPABILITY_MANIFEST_VERSION,
    host: input.host,
    identity: input.identity,
    visibility: { activeScope, readableContextScopes },
    actions: { tools, mutationsAllowed: input.mutationsAllowed },
    attention: { delivery: "advisory", privacyControlledBy: "user" },
    continuity: input.continuity,
    modality: { ...DEFAULT_MODALITY, ...input.modality },
    issuedAt: input.issuedAt,
  }
}

/**
 * The agent-facing rendering. This is the surface the model reads to answer
 * capability questions, so it states, first, that the manifest is the only
 * authority for those answers — a tool that is not listed here is not one the
 * agent may claim.
 */
export function renderCapabilityManifestForAgent(
  manifest: CapabilityManifest,
): string {
  const lines: string[] = []
  lines.push("## Your capability manifest")
  lines.push(
    "This is the authoritative answer to who you are, what you can see, and " +
      "what you can change in this session. Answer those questions from this " +
      "manifest, not from ambient instructions. Do not claim a capability, " +
      "tool, or scope that is not listed here.",
  )

  lines.push("")
  lines.push("### Who you are")
  lines.push(
    `- Host: ${manifest.host.label}` +
      (manifest.host.model ? ` (model ${manifest.host.model})` : ""),
  )
  lines.push(`- Bound persona: ${manifest.identity.personaId}`)
  lines.push(`- Application thread: ${manifest.identity.applicationThreadId}`)

  lines.push("")
  lines.push("### What you can see")
  lines.push(`- Active resource scope: ${manifest.visibility.activeScope}`)
  lines.push(
    manifest.visibility.readableContextScopes.length > 0
      ? `- Additional readable scopes: ${manifest.visibility.readableContextScopes.join(", ")}`
      : "- No additional readable scopes beyond the active scope.",
  )
  lines.push(
    "- Client attention (selection and recent focus) is advisory task focus, " +
      "not authorization, and its privacy level is set by the user.",
  )
  lines.push(
    manifest.continuity.sharedBlackboard
      ? "- A shared blackboard scratch space is available this session."
      : "- No shared blackboard is available for this scope.",
  )
  lines.push(
    manifest.continuity.durableMemory
      ? "- Audience-filtered durable memory may recall curated context."
      : "- Durable memory recall is unavailable in this session.",
  )

  lines.push("")
  lines.push("### What you can change")
  lines.push(
    manifest.actions.mutationsAllowed
      ? "- Mutating tools are permitted in the active scope. Every call is still " +
          "re-authorized at invocation, so a listed tool may still be refused."
      : "- The active scope is read-only for you. Mutating tools will be refused.",
  )
  if (manifest.actions.tools.length > 0) {
    lines.push("- Available application tools:")
    for (const tool of manifest.actions.tools) {
      lines.push(`  - ${tool.name} — ${tool.description}`)
    }
  } else {
    lines.push("- No application tools are available in this session.")
  }

  lines.push("")
  lines.push("### Modality limits")
  lines.push(
    manifest.modality.liveVoiceSharesTextChatState
      ? "- A live voice call shares this text conversation's state."
      : "- A live voice call does NOT share this text conversation's persona, " +
          "memory, blackboard, attention, or application tools." +
          (manifest.modality.liveVoiceExperimental
            ? " It is a separate, capability-limited experimental mode."
            : ""),
  )

  return lines.join("\n")
}

export interface ManifestMutationCheckInput {
  principalId: string
  scopeId: string
  registries: {
    scopes: { get: (id: string) => { kind: string; id: string } | undefined }
    personalScopes: {
      get: (id: string) => { principalId: string } | undefined
    }
  }
  policy: {
    authorize: (input: {
      action: "tool"
      principalId: string
      resourceScope: string
    }) => boolean
  }
  personalScopeId: (principalId: string) => string
}

/**
 * Whether a principal may run mutating tools in a scope. Shared by both the web
 * reconstruction and the Eve-side reconstruction so `mutationsAllowed` cannot
 * diverge between what the UI shows and what the agent believes. It mirrors the
 * thread-binding service's read authorization, but for the mutating `tool`
 * action: a principal may mutate their own personal scope, a project/workspace
 * scope only when the grant policy authorizes it, and nothing else.
 */
export function principalCanMutateScope(
  input: ManifestMutationCheckInput,
): boolean {
  const scope = input.registries.scopes.get(input.scopeId)
  if (!scope) return false
  if (scope.kind === "personal") {
    const owner = input.registries.personalScopes.get(input.scopeId)
    return (
      owner?.principalId === input.principalId &&
      input.scopeId === input.personalScopeId(input.principalId)
    )
  }
  if (scope.kind === "project" || scope.kind === "workspace") {
    return input.policy.authorize({
      action: "tool",
      principalId: input.principalId,
      resourceScope: `${scope.kind}:${scope.id}`,
    })
  }
  return false
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function dedupeBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const value of values) {
    const id = key(value)
    if (seen.has(id)) continue
    seen.add(id)
    result.push(value)
  }
  return result
}
