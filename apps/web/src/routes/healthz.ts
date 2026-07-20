// Route ancestry: __root → /healthz
// Chrome: none — unauthenticated dependency health for the deployment edge.

import { createFileRoute } from "@tanstack/react-router";

import { getAuthDbClient } from "@/lib/auth/server";
import { checkWebHealth } from "@/lib/health.server";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await checkWebHealth(await getAuthDbClient());
          return Response.json({ status: "ok", service: "sigil-chat-web" });
        } catch {
          return Response.json(
            { status: "unhealthy", service: "sigil-chat-web" },
            { status: 503 },
          );
        }
      },
    },
  },
});
