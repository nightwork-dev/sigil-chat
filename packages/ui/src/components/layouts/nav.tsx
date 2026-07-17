// The portable NAVIGATION contract shared by every Layout shell.
//
// This is the decoupling seam: today's shells hardcode their nav
// (sidebar bakes in Dashboard/Chat/Canvas, footer bakes tabs, menubar
// bakes menus), which makes them non-reusable. A shell instead takes a
// NavModel as a prop and never names a route itself — so the same shell
// drops into any project by handing it a different NavModel. Route files
// become thin adapters that own the app's NavModel; the shells own only
// chrome.
//
// No app singletons live here: NavItem.to is a plain string, active-state
// is computed from the router's own pathname hook (framework, not app
// data), and nothing imports a route tree or app store.

import type { LucideIcon } from "lucide-react"
import { useRouterState } from "@tanstack/react-router"

export interface NavItem {
  /** Destination path. Plain string so the model carries no route-tree types. */
  to: string
  label: string
  /** Wayfinding icon (functional, not decoration). Optional for text-only tab bars. */
  icon?: LucideIcon
  /** Match this path exactly (an index/dashboard entry) rather than by prefix. */
  exact?: boolean
}

export interface NavModel {
  /** Wordmark target + label rendered in the shell header. */
  brand?: { label: string; to: string }
  /** Primary navigation entries. The shell decides HOW to render them
   *  (icon rail / underline tabs / section list); the data is identical. */
  items: NavItem[]
  /** Secondary entries pinned away from the primary set (e.g. Settings). */
  footer?: NavItem[]
}

/** Whether an item is the active route for a given pathname. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/** The current pathname (one subscription per shell). */
export function usePathname(): string {
  return useRouterState({ select: (s) => s.location.pathname })
}

/** The active item for a nav set, or undefined at a non-matching path. */
export function useActiveNav(items: NavItem[]): NavItem | undefined {
  const pathname = usePathname()
  return items.find((item) => isNavItemActive(item, pathname))
}
