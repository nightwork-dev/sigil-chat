"use client"

// ManagementTabs — the shared section header for the agent-management
// session (Agents | Skills | Capabilities). Rendered in the shell's top rail
// via each route's staticData.rail.top, so the three management surfaces read
// as ONE navigable session rather than three peer nav entries. The active tab
// follows the current route.

import { Link, useRouterState } from "@tanstack/react-router"

import { cn } from "@workspace/ui/lib/utils"

const SECTIONS = [
  { to: "/agents", label: "Agents" },
  { to: "/skills", label: "Skills" },
  { to: "/capabilities", label: "Capabilities" },
] as const

export function ManagementTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav aria-label="Agent management" className="flex items-center gap-1">
      {SECTIONS.map((section) => {
        const active =
          pathname === section.to || pathname.startsWith(`${section.to}/`)
        return (
          <Link
            key={section.to}
            to={section.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1 text-xs transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
