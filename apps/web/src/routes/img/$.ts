// Route ancestry: __root → /img/$
// Chrome: none — authenticated, scope-authorized artifact byte stream

import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/img/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { readArtifactImageFromRequest } = await import(
          "@/lib/artifact-image.server"
        )
        return readArtifactImageFromRequest(request)
      },
    },
  },
})
