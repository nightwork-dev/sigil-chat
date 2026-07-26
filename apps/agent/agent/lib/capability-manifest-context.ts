import {
  buildCapabilityManifest,
  renderCapabilityManifestForAgent,
  type CapabilityManifestHost,
} from "@workspace/agent-contracts/capability-manifest"

// Eve's side of the capability manifest. It reconstructs the manifest from the
// caller attributes Eve already verified (the signed execution binding and the
// authorized resource scope), never from anything the browser sent, and renders
// it into the per-turn context so the agent answers "who are you / what can you
// see / what can you change" from the manifest rather than ambient instructions.
//
// It runs the exact same `buildCapabilityManifest` the web UI runs, so the two
// surfaces cannot tell different stories about the same session.

export interface CapabilityManifestIdentityInput {
  principalId: string
  personaId: string
  applicationThreadId: string
  /** The scope the session focuses on — the manifest's active resource scope. */
  activeScope: string
  readableContextScopes: string[]
}

export interface CapabilityManifestContextDependencies {
  host: CapabilityManifestHost
  listTools: () => { name: string; description?: string }[]
  canMutate: (principalId: string, scopeId: string) => boolean
  now?: () => number
}

export function createCapabilityManifestContext(
  deps: CapabilityManifestContextDependencies,
) {
  return (identity: CapabilityManifestIdentityInput): string => {
    const manifest = buildCapabilityManifest({
      host: deps.host,
      identity: {
        principalId: identity.principalId,
        personaId: identity.personaId,
        applicationThreadId: identity.applicationThreadId,
      },
      activeScope: identity.activeScope,
      readableContextScopes: identity.readableContextScopes,
      tools: deps.listTools(),
      mutationsAllowed: deps.canMutate(
        identity.principalId,
        identity.activeScope,
      ),
      continuity: {
        conversationPersists: true,
        durableMemory: true,
        sharedBlackboard: true,
      },
      issuedAt: (deps.now ?? nowSeconds)(),
    })
    return renderCapabilityManifestForAgent(manifest)
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
