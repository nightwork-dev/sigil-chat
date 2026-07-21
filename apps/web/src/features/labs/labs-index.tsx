import { Link } from "@tanstack/react-router"
import { ArrowRightIcon, EyeIcon, HandIcon } from "lucide-react"

import { Card, CardContent } from "@workspace/ui/components/card"

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

export function LabsIndex() {
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
            Local interaction experiments. These studies run in this browser,
            require no account, and ask before starting the camera.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {publicLabs.map((lab) => {
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
