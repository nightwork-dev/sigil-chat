// Route: /sidebar/* (legacy compatibility redirect)
// Tree:
//   apps/web/src/routes/__root.tsx   — HTML shell and global providers
//   apps/web/src/routes/sidebar.$.tsx — THIS FILE; no visible chrome
// Content: preserves old deep links while keeping the default app layout pathless

import { createFileRoute, redirect } from "@tanstack/react-router"

const legacyDestinations = {
  dashboard: "/dashboard",
  studio: "/studio",
  review: "/review",
  chat: "/chat",
  skills: "/skills",
  canvas: "/canvas",
  data: "/data",
} as const

export const Route = createFileRoute("/sidebar/$")({
  beforeLoad: ({ params }) => {
    const destination =
      legacyDestinations[params._splat as keyof typeof legacyDestinations] ?? "/studio"
    throw redirect({ to: destination, replace: true })
  },
})
