// ═══════════════════════════════════════════════════════════════════════════
// THE SLOT CONTRACT — one vocabulary, six shells.
// ═══════════════════════════════════════════════════════════════════════════
//
// Every Layout shell in this app is portable chrome: it frames a routed
// <Outlet/> with navigation and NOTHING app-specific. All app data enters
// through a small, uniform set of slots:
//
//   nav       NavModel   — the portable nav (brand + items + footer). REQUIRED.
//   actions   ReactNode  — right-header actions. The shell is app-agnostic and
//                          appends NOTHING of its own: the consuming app injects
//                          its own controls here (e.g. this template passes its
//                          <ThemePicker/>). Keeps the package free of app wiring.
//   children  ReactNode  — the content region, i.e. the routed <Outlet/>.
//
// Shells that own a second region extend the base with ONE named slot each,
// keeping the vocabulary uniform rather than inventing per-shell prop soup:
//
//   FooterShell     + status     (footer status-strip content)
//   MenubarShell    + menus       (the File/Edit/View menu tree)
//   SplitShell      + list        (master pane; children = detail pane)
//   InspectorShell  + inspector   (collapsible right rail) + inspectorTitle
//   SettingsShell   + title       (nav.items ARE the settings sections)
//   SidebarShell    + accountMenu (bottom-of-sidebar identity/sign-out slot,
//                                  rendered alongside nav.footer — content is
//                                  app-authored, e.g. an account dropdown)
//
// Decoupling rules honored (spec §5): no hardcoded route lists, no router
// instance, no app store, no app-specific components. `Link`/`useRouterState`
// are the framework (TanStack Router), not app singletons — the one thing a
// shell must never do is name a route or import app UI, and none of them do.
//
// Viewport: every shell is `h-svh flex flex-col` so a child with
// `flex-1 overflow-auto` actually scrolls instead of pushing the page.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, type ReactNode } from "react"
import { Link, Outlet } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@workspace/ui/components/resizable"
import { Separator } from "@workspace/ui/components/separator"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { PanelRightIcon, PanelRightCloseIcon } from "lucide-react"
import { type NavModel, type NavItem, isNavItemActive, usePathname, useActiveNav } from "./nav"

// ─── Shared chrome atoms ─────────────────────────────────────────────────────

function ShellBrand({ brand }: { brand?: NavModel["brand"] }) {
  if (!brand) return null
  return (
    <Link
      to={brand.to}
      className="shrink-0 text-sm font-medium tracking-tight text-foreground"
    >
      {brand.label}
    </Link>
  )
}

// Underline tab bar — used by every horizontal-nav shell (footer, menubar,
// split, inspector). The active underline is the theme SIGNAL (primary): it
// means exactly one thing, "this is the current route".
function TabNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav className="flex min-w-0 items-center gap-0.5">
      {items.map((item) => {
        const active = isNavItemActive(item, pathname)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "relative flex items-center gap-1.5 px-2 py-1 text-xs transition-colors",
              active
                ? "text-foreground after:absolute after:inset-x-2 after:-bottom-[7px] after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon ? <item.icon className="size-3.5" /> : null}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

// The right-header cluster. The app injects whatever controls it wants here
// (this template passes its <ThemePicker/>); the shell adds nothing of its own.
function HeaderActions({ actions }: { actions?: ReactNode }) {
  return <div className="ml-auto flex items-center gap-2">{actions}</div>
}

interface ShellSlots {
  nav: NavModel
  actions?: ReactNode
  children: ReactNode
}

// ─── SidebarShell ────────────────────────────────────────────────────────────
// Collapsible icon rail (Cmd+B, provided by SidebarProvider) + breadcrumb bar.

export function SidebarShell({
  nav,
  actions,
  children,
  accountMenu,
}: ShellSlots & { accountMenu?: ReactNode }) {
  const active = useActiveNav([...nav.items, ...(nav.footer ?? [])])

  return (
    <SidebarProvider className="!min-h-0 h-svh">
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-9 flex-row items-center justify-between px-3">
          {nav.brand ? (
            <Link
              to={nav.brand.to}
              className="truncate text-sm font-medium tracking-tight group-data-[collapsible=icon]:hidden"
            >
              {nav.brand.label}
            </Link>
          ) : (
            <span />
          )}
          <SidebarTrigger className="group-data-[collapsible=icon]:mx-auto" />
        </SidebarHeader>

        <Separator className="mx-0 w-full" />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <NavMenu items={nav.items} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {(nav.footer && nav.footer.length > 0) || accountMenu ? (
          <SidebarFooter>
            {nav.footer && nav.footer.length > 0 ? (
              <NavMenu items={nav.footer} />
            ) : null}
            {accountMenu}
          </SidebarFooter>
        ) : null}

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-0">
        <header className="flex min-h-9 items-center gap-2 border-b border-border px-3 pt-[env(safe-area-inset-top)]">
          <SidebarTrigger className="md:hidden" />
          <Separator orientation="vertical" className="h-4 md:hidden" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xs">{active?.label ?? nav.brand?.label ?? "Home"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderActions actions={actions} />
        </header>

        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function NavMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isNavItemActive(item, pathname)
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton isActive={active} tooltip={item.label} render={<Link to={item.to} />}>
              {item.icon ? <item.icon className="size-4" /> : null}
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

// ─── FooterShell ─────────────────────────────────────────────────────────────
// Header tab nav + a persistent status strip. `status` is app content.

export function FooterShell({ nav, actions, status, children }: ShellSlots & { status?: ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3">
        <ShellBrand brand={nav.brand} />
        <Separator orientation="vertical" className="h-4" />
        <TabNav items={nav.items} pathname={pathname} />
        <HeaderActions actions={actions} />
      </header>

      <div className="flex-1 min-h-0 overflow-auto">{children}</div>

      {status ? (
        <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border px-3 text-[10px] font-mono text-muted-foreground">
          {status}
        </footer>
      ) : null}
    </div>
  )
}

// ─── MenubarShell ────────────────────────────────────────────────────────────
// Desktop app-style: the app's menu tree (`menus`) + tab nav in one bar.

export function MenubarShell({ nav, actions, menus, children }: ShellSlots & { menus?: ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="mr-1">
          <ShellBrand brand={nav.brand} />
        </div>
        {menus}
        {nav.items.length > 0 ? (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <TabNav items={nav.items} pathname={pathname} />
          </>
        ) : null}
        <HeaderActions actions={actions} />
      </header>

      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  )
}

// ─── SplitShell (master / detail) ──────────────────────────────────────────
// Resizable two-pane skeleton: `list` is the master pane, `children` (the
// Outlet) is the detail pane. The most common app shape (inbox, files, CRM).

export function SplitShell({
  nav,
  actions,
  list,
  children,
}: ShellSlots & { list: ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3">
        <ShellBrand brand={nav.brand} />
        {nav.items.length > 0 ? (
          <>
            <Separator orientation="vertical" className="h-4" />
            <TabNav items={nav.items} pathname={pathname} />
          </>
        ) : null}
        <HeaderActions actions={actions} />
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="32%" minSize="22%" maxSize="48%" className="min-w-0">
          <div className="h-full overflow-auto">{list}</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="68%" className="min-w-0">
          <div className="h-full overflow-auto">{children}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

// ─── InspectorShell (content + right inspector) ──────────────────────────────
// Main content with a collapsible right-hand properties rail. Toggle via the
// header button or Mod+. — a real state transition, so the collapse animates.

export function InspectorShell({
  nav,
  actions,
  inspector,
  inspectorTitle = "Inspector",
  children,
}: ShellSlots & { inspector?: ReactNode; inspectorTitle?: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  useHotkey("Mod+.", () => setOpen((v) => !v), { meta: { name: "Toggle inspector" } })

  const hasInspector = Boolean(inspector)

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3">
        <ShellBrand brand={nav.brand} />
        {nav.items.length > 0 ? (
          <>
            <Separator orientation="vertical" className="h-4" />
            <TabNav items={nav.items} pathname={pathname} />
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {actions}
          {hasInspector ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={open}
              aria-label={open ? `Hide ${inspectorTitle} (Cmd+.)` : `Show ${inspectorTitle} (Cmd+.)`}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <PanelRightCloseIcon className="size-4" /> : <PanelRightIcon className="size-4" />}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">{children}</div>
        {hasInspector ? (
          <aside
            className={cn(
              "shrink-0 overflow-hidden border-l border-border transition-[width] duration-200 ease-out",
              open ? "w-72" : "w-0 border-l-0",
            )}
            aria-hidden={!open}
          >
            <div className="flex h-full w-72 flex-col">
              <div className="flex h-9 shrink-0 items-center border-b border-border px-3 text-xs font-medium">
                {inspectorTitle}
              </div>
              <div className="flex-1 overflow-auto">{inspector}</div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

// ─── SettingsShell ───────────────────────────────────────────────────────────
// Settings-section nav (nav.items) on the left, the routed section pane on the
// right. The classic preferences shape.

export function SettingsShell({ nav, actions, title = "Settings", children }: ShellSlots & { title?: string }) {
  const pathname = usePathname()
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3">
        <ShellBrand brand={nav.brand} />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-xs font-medium">{title}</span>
        <HeaderActions actions={actions} />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-52 shrink-0 overflow-auto border-r border-border p-2">
          <ul className="flex flex-col gap-0.5">
            {nav.items.map((item) => {
              const active = isNavItemActive(item, pathname)
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.icon ? <item.icon className="size-4" /> : null}
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}

// A route component passes the routed content as `children`; this re-export
// keeps adapters from importing Outlet separately when they only forward it.
export { Outlet }
