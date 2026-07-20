// Route: /agents
// Tree:
//   apps/web/src/routes/__root.tsx           — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx              — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/agents.index.tsx — THIS FILE
// Content: registry-backed Agent Studio roster linking to each persona profile.

import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Card, CardContent } from "@workspace/ui/components/card"

import {
  agentPortraitUrl,
  agentRosterQueryOptions,
} from "@/lib/agent-profile"

export const Route = createFileRoute("/_app/agents/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      agentRosterQueryOptions(context.user.id),
    ),
  component: AgentRoster,
})

function AgentRoster() {
  const personas = Route.useLoaderData()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Choose a persona to inspect its identity, memory, and recent sessions.
        </p>
      </header>

      {personas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No personas are available in this workspace yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {personas.map((persona) => {
            const initial = persona.name.slice(0, 1).toUpperCase()
            const portraitUrl = agentPortraitUrl(
              persona.id,
              persona.hasPortrait,
            )
            return (
              <Link
                key={persona.id}
                to="/agents/$personaId"
                params={{ personaId: persona.id }}
                className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/40">
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="size-11">
                      {portraitUrl ? (
                        <AvatarImage src={portraitUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="font-medium text-primary">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-medium">{persona.name}</h2>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {persona.description || persona.id}
                      </p>
                    </div>
                    <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
