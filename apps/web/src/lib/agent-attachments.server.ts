import { readGonkClientEnvironment } from "@workspace/runtime-env/server"

import type { UploadedAttachment } from "./agent-attachments"
import { AGENT_SCOPE_HEADER } from "./agent-session-scope"
import { assertAuthorizedScope } from "./agent-scope-authorization.server"
import type { SigilAuthSession } from "./auth/server"
import { requireSession } from "./auth/session"

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export interface AttachmentUploadDependencies {
  fetcher: typeof fetch
  getSession: () => Promise<SigilAuthSession | null>
  ownsThread: (userId: string, threadId: string) => boolean
  readEnvironment: () => {
    apiKey?: string
    gonkMcpUrl: string
  }
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
  assertAuthorizedScope(scope, session.user.id, dependencies.ownsThread)

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

  const { apiKey, gonkMcpUrl } = dependencies.readEnvironment()
  if (!apiKey) {
    throw new Error(
      "GONK_MCP_KEY is not configured for the web app's server process; attachment uploads cannot be authenticated against Gonk.",
    )
  }
  const response = await dependencies.fetcher(
    gonkMcpUrl.replace(/\/mcp\/?$/, "/upload"),
    {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-filename": file.name,
        [AGENT_SCOPE_HEADER]: scope,
        authorization: `Bearer ${apiKey}`,
      },
      body: new Uint8Array(await file.arrayBuffer()),
    },
  )
  if (!response.ok) {
    throw new Error(
      `Attachment upload failed (${response.status} ${response.statusText})`,
    )
  }
  return (await response.json()) as UploadedAttachment
}

export async function uploadAgentAttachmentFromRequest(
  data: FormData,
): Promise<UploadedAttachment> {
  const [{ getSession }, { agentThreadRepository }] = await Promise.all([
    import("./auth/session"),
    import("./agent-threads.server"),
  ])
  return uploadAgentAttachment(data, {
    fetcher: fetch,
    getSession,
    ownsThread: (userId, threadId) =>
      Boolean(agentThreadRepository.get(userId, threadId)),
    readEnvironment: () => readGonkClientEnvironment(process.env),
  })
}
