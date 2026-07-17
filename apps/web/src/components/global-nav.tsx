import { Link, useRouterState } from "@tanstack/react-router"
import { cn } from "@workspace/ui/lib/utils"
import { ThemePicker } from "@/components/theme-picker"
import { SITE } from "@/lib/site"

/**
 * The site-wide nav strip — the single "where am I / where can I go" surface
 * shared by the root landing, the /examples gallery, and (merged into the
 * existing breadcrumb bar) the /showcase shell. A namespaced group rather
 * than a single component because each caller composes a different subset:
 * the landing/gallery render the full `Strip`, while `showcase.tsx` reuses
 * `Wordmark` and the two links individually to avoid a second breadcrumb
 * bar or a duplicate theme picker.
 */

function useIsActive(to: string) {
  return useRouterState({ select: (s) => s.location.pathname === to || s.location.pathname.startsWith(`${to}/`) })
}

function navLinkClass(active: boolean, className?: string) {
  return cn(
    "text-xs transition-colors",
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    className,
  )
}

// Instrument-grade brand mark for the 36px nav strip: a dial ring (primary)
// with an off-center signal pulse (info) — theme tokens only, so it repaints
// correctly across all seven themes.
function WordmarkGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-4 shrink-0", className)}>
      <circle cx="8" cy="8" r="6" className="fill-none stroke-primary" strokeWidth="1.5" />
      <circle cx="10.5" cy="5.5" r="1.5" className="fill-info" />
    </svg>
  )
}

function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("inline-flex items-center gap-1.5 text-sm font-medium tracking-tight", className)}
    >
      <WordmarkGlyph />
      <span className="truncate">{SITE.name}</span>
    </Link>
  )
}

function ComponentsLink({ className }: { className?: string }) {
  const active = useIsActive("/showcase")
  return (
    <Link to="/showcase" className={navLinkClass(active, className)}>
      Components
    </Link>
  )
}

function GalleryLink({ className }: { className?: string }) {
  const active = useIsActive("/gallery")
  return (
    <Link to="/gallery" className={navLinkClass(active, className)}>
      Gallery
    </Link>
  )
}

function ExamplesLink({ className }: { className?: string }) {
  const active = useIsActive("/examples")
  return (
    <Link to="/examples" className={navLinkClass(active, className)}>
      Examples
    </Link>
  )
}

function Strip({ className }: { className?: string }) {
  return (
    <header className={cn("flex h-9 shrink-0 items-center gap-4 border-b border-border px-3", className)}>
      <Wordmark />
      <nav className="flex items-center gap-3">
        <ComponentsLink />
        <GalleryLink />
        <ExamplesLink />
      </nav>
      <ThemePicker variant="compact" className="ml-auto" />
    </header>
  )
}

export const GlobalNav = { Strip, Wordmark, ComponentsLink, GalleryLink, ExamplesLink }
