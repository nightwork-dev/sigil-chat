import { Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  EyeIcon,
  FileCheck2Icon,
  HandIcon,
  LibraryBigIcon,
  ArchiveIcon,
  NetworkIcon,
} from "lucide-react"

import { Card, CardContent } from "@workspace/ui/components/card"

// Cards that can touch remote resources (the agent, Gonk tools) — hidden
// entirely from anonymous visitors, not just disabled (nothing
// remote-resource-using is visible without auth).
const gatedLabs = [
  {
    to: "/studio" as const,
    title: "Studio",
    description:
      "The reducer-graph authoring canvas — compose typed graphs live, with ambient agent commentary and annotation overlays.",
    icon: NetworkIcon,
  },
  {
    to: "/review" as const,
    title: "Review",
    description:
      "Document review workspace — passage annotations, decisions, and the agent sidecar. Demo-stage; its pieces are earmarked for generalization.",
    icon: FileCheck2Icon,
  },
  {
    to: "/evidence" as const,
    title: "Evidence",
    description:
      "The Evidence Room — a pinned resource corpus the agent's tools can search and cite. Demo-stage.",
    icon: LibraryBigIcon,
  },
  {
    to: "/artifacts" as const,
    title: "Artifacts",
    description:
      "Generated artifact browser — images and files produced through the agent's tool calls. Demo-stage.",
    icon: ArchiveIcon,
  },
]

// Local-only studies — safe (and nice) to show without auth.
const publicLabs = [
  {
    to: "/labs/gaze" as const,
    title: "Gaze",
    description:
      "Calibrate webcam-based gaze estimation, inspect confidence, and test dwell-driven regions.",
    icon: EyeIcon,
  },
  {
    to: "/labs/hands" as const,
    title: "Hands",
    description:
      "Explore pointing, pinch, drag, and two-hand transforms with a local webcam feed.",
    icon: HandIcon,
  },
]

export function LabsIndex({ authenticated }: { authenticated: boolean }) {
  const labs = authenticated ? [...gatedLabs, ...publicLabs] : publicLabs

  return (
    <main className="min-h-svh bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 max-w-2xl">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Labs</h1>
            <Link
              to="/chat"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to the app
            </Link>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Demos and experiments — reachable, but out of the product's front
            door. Camera-based studies process locally in this browser
            session and ask before starting the camera.
            {authenticated
              ? ""
              : " Sign in to see the workspaces that use the agent."}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {labs.map((lab) => {
            const Icon = lab.icon

            return (
              <Link
                key={lab.to}
                to={lab.to}
                className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/40">
                  <CardContent className="flex h-full items-start gap-4 p-5">
                    <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium">{lab.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {lab.description}
                      </p>
                    </div>
                    <ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </main>
  )
}
