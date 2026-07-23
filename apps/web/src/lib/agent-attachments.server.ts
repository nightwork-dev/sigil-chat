import type { UploadedAttachment } from "./agent-attachments"
import { assertAuthorizedScope } from "./agent-scope-authorization.server"
import { artifactUrlForWeb, getWebArtifactStore } from "./artifact-repository.server"
import type { SigilAuthSession } from "./auth/server"
import { requireSession } from "./auth/session"

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export interface AttachmentUploadDependencies {
  getSession: () => Promise<SigilAuthSession | null>
  ownedThreadHomeScope: (userId: string, threadId: string) => string | undefined
  store?: ReturnType<typeof getWebArtifactStore>
}

export async function uploadAgentAttachment(
  data: FormData,
  dependencies: AttachmentUploadDependencies,
): Promise<UploadedAttachment> {
  const session = await dependencies.getSession()
  requireSession(session)

  const scope = data.get("scope")
  if (typeof scope !== "string" || scope.trim().length === 0) {
    throw new Error("Attachment upload requires a resource scope.")
  }
  assertAuthorizedScope(
    scope,
    session.user.id,
    dependencies.ownedThreadHomeScope,
    undefined,
    undefined,
    "tool",
  )

  const file = data.get("file")
  if (!(file instanceof File)) {
    throw new Error("Attachment upload requires a `file` field.")
  }
  if (file.size === 0) throw new Error("Attachment file is empty.")
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachment is too large (${file.size} bytes; limit ${MAX_ATTACHMENT_BYTES} bytes).`,
    )
  }

  const store = dependencies.store ?? getWebArtifactStore()
  const artifact = await store.putFile(
    {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      scope,
    },
    { id: session.user.id },
  )
  return {
    url: artifactUrlForWeb(artifact),
    key: artifact.id,
    mediaType: artifact.mediaType,
    size: artifact.size,
    filename: artifact.filename,
  }
}

export async function uploadAgentAttachmentFromRequest(
  data: FormData,
): Promise<UploadedAttachment> {
  const [{ getSession }, { agentThreadRepository }] = await Promise.all([
    import("./auth/session"),
    import("./agent-threads.server"),
  ])
  return uploadAgentAttachment(data, {
    getSession,
    ownedThreadHomeScope: (userId, threadId) =>
      agentThreadRepository.get(userId, threadId)?.executionBinding?.homeScopeId,
  })
}
