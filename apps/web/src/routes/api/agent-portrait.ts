// Route ancestry: __root → /api/agent-portrait
// Chrome: none — owner-gated static byte stream, not a page.
//
// Serves a selected persona's portrait blob (persona-tier blobs/portrait.png,
// per @gonk/persona's PersonaRegistry.portraitFor) for Agent Studio. The
// owner can change a portrait in the profile; absent blobs still 404 and the
// client falls back to the initial glyph.

import { createFileRoute } from "@tanstack/react-router"
import { readFile } from "node:fs/promises"

import { getSession, requireOwner } from "@/lib/auth/session"
import { personaRegistry } from "@/lib/agent-profile.server"

export const Route = createFileRoute("/api/agent-portrait")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getSession(request.headers)
        try {
          requireOwner(session)
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
            // Portrait writes should be visible immediately in Agent Studio.
            "Cache-Control": "private, no-store",
          },
        })
      },
    },
  },
})
