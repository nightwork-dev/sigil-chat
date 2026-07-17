// Route: /showcase/*
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/showcase.tsx — THIS FILE
// Chrome: collapsible sidebar (Cmd+B), top breadcrumb bar merged with global nav (Components/Examples links), theme picker, command menu (Cmd+K)
// Provides: SidebarProvider, CommandMenuProvider, nav across the 18 component categories grouped into 4 clusters (Controls / Composition / Data Display / Foundation)

import { useMemo } from "react"
import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
} from "@workspace/ui/components/sidebar"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb"
import { Separator } from "@workspace/ui/components/separator"
import { CommandMenuProvider, CommandMenu, type CommandAction } from "@workspace/ui/components/command-menu"
import { ThemePicker } from "@/components/theme-picker"
import { GlobalNav } from "@/components/global-nav"
import { CATEGORY_GROUPS, CATEGORIES, buildComponentIndex, categoryCounts, CategoryNewBadge } from "@/components/showcase/landing"

export const Route = createFileRoute("/showcase")({
  component: ShowcaseLayout,
})

const allCategories = Object.values(CATEGORIES)
// Build-static: categoryCounts() derives from the registry + isNew (baked
// reference), so it's deterministic and safe to evaluate once at module load
// (identical on server and client — no hydration drift).
const CATEGORY_COUNTS = categoryCounts()

function ShowcaseLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const currentPage = allCategories.find((item) => pathname.startsWith(item.to))
  // Totals + new-within-window counts, from the one category→component
  // mapping in landing.tsx so sidebar, landing cards, and per-demo badges
  // can't disagree.
  const counts = CATEGORY_COUNTS

  // Built once — the command menu's search index across every category and
  // every registry component. Both groups just navigate; there's no other
  // "action" concept in this showcase. `group` is deliberately left unset:
  // CommandMenuProvider's "main" page only includes actions where `group`
  // is undefined or "main" (any other value is page-scoped and gets
  // excluded from the searchable set entirely, not just re-labeled) — so a
  // custom group name here would silently drop these out of search.
  const searchActions = useMemo<CommandAction[]>(() => {
    const categoryActions: CommandAction[] = (Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((id) => {
      const category = CATEGORIES[id]
      const { total, fresh } = counts[id]
      return {
        id: `category-${category.to}`,
        label: category.label,
        // Trailing single-line meta: total in muted, then the new-count in
        // the theme SIGNAL tone (text-primary) — the same "recently-added,
        // auto-derived" meaning and token as the sidebar/landing badges, so
        // the three surfaces stay consistent. Not stacked (no double-height).
        meta:
          fresh > 0 ? (
            <span className="flex items-center gap-1.5">
              <span>{total}</span>
              <span className="text-primary">{fresh} new</span>
            </span>
          ) : (
            total
          ),
        icon: category.icon,
        onExecute: () => navigate({ to: category.to }),
      }
    })

    const componentActions: CommandAction[] = buildComponentIndex().map((entry) => {
      const category = CATEGORIES[entry.categoryId]
      return {
        id: `component-${entry.name}`,
        label: entry.label,
        // The owning category as a trailing muted tag, not a stacked line.
        meta: category.label,
        icon: category.icon,
        onExecute: () => navigate({ to: category.to }),
      }
    })

    return [...categoryActions, ...componentActions]
  }, [navigate])

  return (
    <CommandMenuProvider initialActions={searchActions}>
      <SidebarProvider className="!min-h-0 h-svh">
        <Sidebar collapsible="icon">
          <SidebarHeader className="h-9 flex-row items-center justify-between px-3">
            <GlobalNav.Wordmark className="truncate group-data-[collapsible=icon]:hidden" />
            <SidebarTrigger className="group-data-[collapsible=icon]:mx-auto" />
          </SidebarHeader>

          <Separator className="mx-0 w-full" />

          <SidebarContent>
            {CATEGORY_GROUPS.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.categories.map((id) => {
                      const category = CATEGORIES[id]
                      const { total, fresh } = counts[id]
                      const active = pathname.startsWith(category.to)
                      return (
                        <SidebarMenuItem key={category.to}>
                          <SidebarMenuButton isActive={active} tooltip={fresh > 0 ? `${category.label} — ${fresh} new` : category.label} render={<Link to={category.to} />}>
                            <category.icon className="size-4" />
                            <span>{category.label}</span>
                            {/* Signal dot / count: this category contains
                                recently-added components (same isNew aggregate
                                as the landing cards). Sits with the label so
                                it survives the icon-collapsed rail via tooltip. */}
                            <CategoryNewBadge fresh={fresh} className="ml-1" />
                          </SidebarMenuButton>
                          <SidebarMenuBadge className="tabular-nums text-muted-foreground">{total}</SidebarMenuBadge>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-h-0">
          <header className="flex h-9 items-center gap-2 border-b border-border px-3">
            <SidebarTrigger className="md:hidden" />
            <Separator orientation="vertical" className="h-4 md:hidden" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-xs">{currentPage?.label ?? "Showcase"}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-3">
              <GlobalNav.ComponentsLink />
              <GlobalNav.ExamplesLink />
              <ThemePicker variant="compact" />
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>

      <CommandMenu placeholder="Search components..." />
    </CommandMenuProvider>
  )
}
