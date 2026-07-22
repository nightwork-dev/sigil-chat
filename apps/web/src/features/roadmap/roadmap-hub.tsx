"use client"

import { Link } from "@tanstack/react-router"
import { FileTextIcon, LayoutDashboardIcon } from "lucide-react"

import { RoadmapWorkspace } from "@/features/roadmap/roadmap-workspace"
import { SpecsWorkspace } from "@/features/roadmap/specs-workspace"
import type { CurrentSessionUser } from "@/lib/auth/route-guard"
import { Button } from "@workspace/ui/components/button"

export type RoadmapView = "board" | "specs"

export function RoadmapHub({
  viewer,
  view,
  initialStoryId,
  initialSpecId,
}: {
  viewer: CurrentSessionUser
  view: RoadmapView
  initialStoryId?: string
  initialSpecId?: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <nav aria-label="Roadmap views" className="flex shrink-0 items-center gap-1 border-b border-border p-2">
        <Button
          size="sm"
          variant={view === "board" ? "secondary" : "ghost"}
          aria-current={view === "board" ? "page" : undefined}
          nativeButton={false}
          render={<Link to="/roadmap" search={{ view: "board" }} />}
        >
          <LayoutDashboardIcon />
          Board
        </Button>
        <Button
          size="sm"
          variant={view === "specs" ? "secondary" : "ghost"}
          aria-current={view === "specs" ? "page" : undefined}
          nativeButton={false}
          render={<Link to="/roadmap" search={{ view: "specs" }} />}
        >
          <FileTextIcon />
          Specs
        </Button>
      </nav>
      {view === "specs" ? (
        <SpecsWorkspace initialSelectedId={initialSpecId} />
      ) : (
        <RoadmapWorkspace viewer={viewer} initialSelectedId={initialStoryId} />
      )}
    </div>
  )
}
