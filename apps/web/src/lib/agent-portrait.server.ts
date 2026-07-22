import { readFile } from "node:fs/promises"

import { getSession, requireSession } from "./auth/session"
import { personaRegistry } from "./agent-profile.server"

export async function readAgentPortraitFromRequest(
  request: Request,
): Promise<Response> {
  const session = await getSession(request.headers)
  try {
    requireSession(session)
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? (error as { status: number }).status
        : 403
    return new Response(null, { status })
  }

  const personaId = new URL(request.url).searchParams
    .get("personaId")
    ?.trim()
  if (!personaId || !personaRegistry.exists(personaId)) {
    return new Response(null, { status: 404 })
  }

  const handle = personaRegistry.portraitFor(personaId)
  if (!handle) return new Response(null, { status: 404 })

  const bytes = await readFile(handle.path)
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": handle.mimeType ?? "image/png",
      "Cache-Control": "private, no-store",
    },
  })
}
