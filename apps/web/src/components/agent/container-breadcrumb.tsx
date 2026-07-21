"use client"

// §3.4 — the container segment of the shell breadcrumb: `Project › Workspace ›`
// before the surface crumb, making "where am I" legible on every route without
// redesigning each surface. Read-only context (Q2).
//
// Principal-level surfaces (/agents, /capabilities, /skills, /studio) aren't
// scoped to a container, so the segment omits itself there (spec §3.2) —
// showing a container on those routes would lie about the scope of what follows.

import { useRouterState } from "@tanstack/react-router"

import {
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"

import { useActiveContainer } from "@/lib/active-container"

const PRINCIPAL_LEVEL_PREFIXES = ["/agents", "/capabilities", "/skills", "/studio"]

export function ContainerBreadcrumb() {
  const container = useActiveContainer()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (!container.isReady) return null
  if (PRINCIPAL_LEVEL_PREFIXES.some((p) => pathname.startsWith(p))) return null

  const segments = [container.projectName, container.workspaceName].filter(
    (name): name is string => Boolean(name),
  )
  if (segments.length === 0) return null

  return (
    <>
      {segments.map((name) => (
        <span key={name} className="contents">
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs text-muted-foreground">
              {name}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </span>
      ))}
    </>
  )
}
