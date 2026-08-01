import { Link } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArrowRightIcon,
  FileCheck2Icon,
  LibraryBigIcon,
  NetworkIcon,
} from "lucide-react"

import { Card, CardContent } from "@workspace/ui/components/card"

import type { FeatureFlagState } from "@/lib/feature-flags"

interface DemoEntry {
  to: "/demos/studio" | "/demos/review" | "/demos/evidence" | "/demos/artifacts"
  title: string
  description: string
  icon: typeof NetworkIcon
  /** Gated by this declared feature flag (FLAG.1). Absent means ungated. */
  flagId?: string
}

const demos: readonly DemoEntry[] = [
  {
    to: "/demos/studio",
    title: "Studio",
    description:
      "Compose typed reducer graphs live, with ambient agent commentary and annotation overlays.",
    icon: NetworkIcon,
    flagId: "surfaces.reducerStudio",
  },
  {
    to: "/demos/review",
    title: "Review",
    description:
      "Review documents through passage annotations, decisions, and an agent sidecar.",
    icon: FileCheck2Icon,
  },
  {
    to: "/demos/evidence",
    title: "Evidence",
    description:
      "Search a pinned resource corpus and ask questions with exact citations.",
    icon: LibraryBigIcon,
  },
  {
    to: "/demos/artifacts",
    title: "Artifacts",
    description:
      "Browse images and files produced through authenticated agent tool calls.",
    icon: ArchiveIcon,
  },
]

export function DemosIndex({
  flags,
}: {
  flags: readonly FeatureFlagState[]
}) {
  // A card whose flag is declared and explicitly off is hidden. A card whose
  // flag is undeclared, or whose id didn't come back in this response, stays
  // visible — this list only ever HIDES on a positive "off", never on a
  // lookup that failed for an unrelated reason.
  const visibleDemos = demos.filter((demo) => {
    if (!demo.flagId) return true
    const flag = flags.find((candidate) => candidate.id === demo.flagId)
    return flag ? flag.enabled : true
  })

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Demos</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Authenticated product demonstrations that exercise the agent,
          application tools, and durable workspace resources.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleDemos.map((demo) => {
          const Icon = demo.icon

          return (
            <Link
              className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={demo.to}
              to={demo.to}
            >
              <Card className="h-full transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/40">
                <CardContent className="flex h-full items-start gap-4 p-5">
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium">{demo.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {demo.description}
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
  )
}
