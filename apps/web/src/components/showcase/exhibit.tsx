import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { InstallSnippet } from "@workspace/ui/components/install-snippet"
import { isNew } from "@workspace/ui/lib/component-meta"

// Showcase-local exhibit frame. A faithful superset of packages/ui's
// ExhibitCard (same card/header/body markup) that additionally renders a
// "New" tag next to the title when the demo maps to a recently-added
// registry item. It lives in apps/web (showcase presentation), not
// packages/ui, so the badge wiring never touches the distributable UI
// package. ExhibitCard's collapsible `controls` slot is intentionally
// dropped here — no showcase exhibit uses it.

interface ExhibitProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  /** Registry item name (kebab-case). Drives both the copyable install
   * command and the "New" tag. Omit for composite demos that don't map to a
   * single registry component. */
  installName?: string
}

// The "New" tag communicates exactly one fact: this registry item was first
// committed within 14 days of the current registry build (isNew compares
// only baked timestamps — never Date.now() — so it's SSR-safe and
// self-expires as the repo ages, with zero manual upkeep). It is metadata,
// not a state signal, so it deliberately uses a neutral outline chip rather
// than a semantic color token (primary/destructive keep their single
// meanings). Rendered only when a demo maps to a real registry name.
function NewTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-border px-1.5 font-mono text-[8px] font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      New
    </span>
  )
}

function Exhibit({ title, subtitle, children, className, installName }: ExhibitProps) {
  const showNew = installName ? isNew(installName) : false

  return (
    <div
      data-slot="exhibit-card"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-foreground">
            {title}
          </span>

          {showNew && <NewTag />}

          {subtitle && (
            <>
              <span className="text-[9px] text-muted-foreground">&middot;</span>
              <span className="min-w-0 truncate font-mono text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {subtitle}
              </span>
            </>
          )}
        </div>

        {installName && <InstallSnippet name={installName} className="max-w-[45%]" />}
      </div>

      <div className="px-3 pb-3">{children}</div>
    </div>
  )
}

export { Exhibit, NewTag }
export type { ExhibitProps }
