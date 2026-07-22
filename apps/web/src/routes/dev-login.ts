// Route ancestry: __root → /dev-login
// Chrome: none — development-only owner-session exchange; unavailable in production.

import { createFileRoute } from "@tanstack/react-router"

import { developmentLogin } from "@/lib/auth/dev-login.server"

export const Route = createFileRoute("/dev-login")({
  server: {
    handlers: {
      GET: ({ request }) => developmentLogin(request),
    },
  },
})
