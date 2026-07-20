import {
  getSessionArtifactStore,
  type SessionArtifactStore,
} from "./artifact-store.js"

type HealthArtifactStore = Pick<
  SessionArtifactStore,
  "putFile" | "readContent" | "removeFromScope"
>

const probeScope = { tier: "session", id: "service-health" } as const
const probeBytes = new TextEncoder().encode("sigil-chat-gonk-health-v1")

export async function createHealthResponse(
  artifacts: HealthArtifactStore = getSessionArtifactStore(),
): Promise<Response> {
  try {
    const stored = await artifacts.putFile({
      bytes: probeBytes,
      filename: "health.txt",
      mediaType: "text/plain",
      scope: probeScope,
    })
    const content = await artifacts.readContent(stored.id, probeScope)
    if (!sameBytes(content.bytes, probeBytes)) {
      throw new Error("Artifact health probe read different bytes than it wrote.")
    }
    await artifacts.removeFromScope(stored.id, probeScope)
    return Response.json({
      status: "ok",
      service: "sigil-chat-gonk",
      checks: { artifactStore: "ok" },
    })
  } catch {
    return Response.json(
      {
        status: "error",
        service: "sigil-chat-gonk",
        checks: { artifactStore: "error" },
      },
      { status: 503 },
    )
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  )
}
