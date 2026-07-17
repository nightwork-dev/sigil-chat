"use client"

// GuideShell — a two-pane shell for docs/guide-style reading: a sticky
// scroll-spy left nav (groups → items → subsections) and a scrollable
// content column on the right. An IntersectionObserver watches every
// registered section and highlights whichever nav entry is nearest the top
// of the scroll region; clicking a nav entry scroll-into-views its section.
//
// Content registers itself for scroll-spy via the render-prop
// `registerRef(id, el)` — GuideSection (guide-content.tsx) forwards it
// automatically, so a typical page just nests GuideSections inside the
// children render-prop and the wiring is automatic.

import { useCallback, useEffect, useRef, useState } from "react"
import type { ComponentType, ReactNode, Ref, RefCallback } from "react"
import { cn } from "@workspace/ui/lib/utils"

/** Render-prop for navigation links — pass your router's Link (e.g. TanStack Router's). */
export type GuideLinkComponent = ComponentType<{ to: string; className?: string; children: ReactNode }>

export interface GuideNavItem {
  id: string
  label: string
  /** When set, the entry is a Link to another page instead of a hash scroll within the current page. */
  to?: string
  subsections?: Array<{ id: string; label: string }>
}

export interface GuideNavGroup {
  label: string
  items: Array<GuideNavItem>
}

/** Optional sub-page switcher above the section nav, e.g. tabs between sibling guide pages. */
export interface GuideSubpage {
  to: string
  label: string
  exact?: boolean
}

export type RegisterRef = (id: string, el: HTMLElement | null) => void

interface GuideShellProps {
  nav: Array<GuideNavGroup>
  subpages?: Array<GuideSubpage>
  /** Current pathname, for highlighting the active subpage — pass your router's current path. */
  pathname?: string
  /** Your router's Link component, used for subpage tabs and `to`-based nav items. */
  linkComponent?: GuideLinkComponent
  children: (registerRef: RegisterRef) => ReactNode
  /**
   * Escape hatch onto the real scroll container (the element GuideShell
   * itself scrolls internally for scroll-spy). Nothing here reads it —
   * GuideShell doesn't expose a scroll-position API — it exists purely so a
   * caller that needs the container (e.g. to derive a live viewport for a
   * minimap) doesn't have to duplicate GuideShell's DOM structure to find it.
   */
  scrollRef?: Ref<HTMLDivElement>
  className?: string
}

function GuideShell({ nav, subpages, pathname = "", linkComponent, children, scrollRef, className }: GuideShellProps) {
  const firstId = nav[0]?.items[0]?.id ?? ""
  const [activeId, setActiveId] = useState<string>(firstId)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  // a div, not <main> — GuideShell is meant to nest inside a host app's own
  // layout (which already owns the page's <main> landmark), so it must not
  // introduce a second one.
  const mainRef = useRef<HTMLDivElement | null>(null)

  // Merge the internal scroll-spy ref with the caller's optional escape
  // hatch — both need the same DOM node, and refs don't compose on their own.
  const setMainRef = useCallback<RefCallback<HTMLDivElement>>(
    (el) => {
      mainRef.current = el
      if (typeof scrollRef === "function") scrollRef(el)
      else if (scrollRef) (scrollRef as { current: HTMLDivElement | null }).current = el
    },
    [scrollRef]
  )

  const registerRef = useCallback<RegisterRef>((id, el) => {
    if (el) sectionRefs.current.set(id, el)
    else sectionRefs.current.delete(id)
  }, [])

  useEffect(() => {
    const root = mainRef.current

    // At the very bottom, the last (often short) section can never scroll up
    // into the top active band, so the observer alone never marks it active —
    // it sticks on the second-to-last. Detecting bottom here forces the last
    // registered section active. Both the observer and the scroll listener go
    // through this so neither can race-override the other.
    const applyActive = (topmostVisibleId?: string) => {
      if (root && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
        const ids = [...sectionRefs.current.keys()]
        const last = ids[ids.length - 1]
        if (last) {
          setActiveId(last)
          return
        }
      }
      if (topmostVisibleId) setActiveId(topmostVisibleId)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        applyActive(visible[0]?.target.id)
      },
      {
        root,
        // bias toward the top third of the viewport so a section reads as
        // "active" once its heading reaches the upper band.
        rootMargin: "-15% 0px -65% 0px",
        threshold: 0,
      }
    )

    const onScroll = () => applyActive()
    root?.addEventListener("scroll", onScroll, { passive: true })

    const raf = requestAnimationFrame(() => {
      for (const el of sectionRefs.current.values()) observer.observe(el)
    })

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      root?.removeEventListener("scroll", onScroll)
    }
  }, [])

  const scrollTo = useCallback((id: string) => {
    const el = sectionRefs.current.get(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
      setActiveId(id)
    }
  }, [])

  return (
    <div data-slot="guide-shell" className={cn("flex h-full", className)}>
      <GuideSidebar nav={nav} subpages={subpages} pathname={pathname} linkComponent={linkComponent} activeId={activeId} onSelect={scrollTo} />
      <div ref={setMainRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-12 lg:px-10">{children(registerRef)}</div>
      </div>
    </div>
  )
}

function GuideSidebar({
  nav,
  subpages,
  pathname,
  linkComponent: LinkComponent,
  activeId,
  onSelect,
}: {
  nav: Array<GuideNavGroup>
  subpages?: Array<GuideSubpage>
  pathname: string
  linkComponent?: GuideLinkComponent
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border px-4 py-6 lg:block">
      {subpages && subpages.length > 0 && LinkComponent && (
        <div className="mb-5 space-y-0.5 border-b border-border pb-5">
          {subpages.map((p) => {
            const active = p.exact ? pathname === p.to : pathname.startsWith(p.to)
            return (
              <LinkComponent
                key={p.to}
                to={p.to}
                className={cn(
                  "block rounded px-2 py-1 font-mono text-[11.5px] transition-colors",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </LinkComponent>
            )
          })}
        </div>
      )}
      <nav className="space-y-6">
        {nav.map((group) => (
          <div key={group.label}>
            <div className="mb-2 flex items-center gap-2">
              <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest text-primary">{group.label}</span>
              <span className="h-px flex-1 bg-primary/15" />
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <GuideNavEntry key={item.id} item={item} activeId={activeId} onSelect={onSelect} linkComponent={LinkComponent} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

function GuideNavEntry({
  item,
  activeId,
  onSelect,
  linkComponent: LinkComponent,
}: {
  item: GuideNavItem
  activeId: string
  onSelect: (id: string) => void
  linkComponent?: GuideLinkComponent
}) {
  const isActive = activeId === item.id || (item.subsections?.some((s) => s.id === activeId) ?? false)

  const entryCls = cn(
    "block w-full rounded px-2 py-1 text-left text-[11.5px] transition-colors",
    isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
  )

  return (
    <div>
      {item.to && LinkComponent ? (
        <LinkComponent to={item.to} className={entryCls}>
          {item.label}
        </LinkComponent>
      ) : (
        <button type="button" onClick={() => onSelect(item.id)} className={entryCls}>
          {item.label}
        </button>
      )}
      {item.subsections && item.subsections.length > 0 && (
        <div className="mt-0.5 ml-2 space-y-0.5 border-l border-border pl-2">
          {item.subsections.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => onSelect(sub.id)}
              className={cn(
                "block w-full rounded px-2 py-0.5 text-left text-[10.5px] transition-colors",
                activeId === sub.id ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground"
              )}
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { GuideShell }
export type { GuideShellProps }
