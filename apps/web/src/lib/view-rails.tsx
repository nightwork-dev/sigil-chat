"use client"

// ViewRails — how a route fills the shell's rails WITHOUT owning chrome.
//
// TanStack idiom, no runtime injection: each route declares its rail content
// in `staticData.rail` (components + chord lists), and the _app layout reads
// the matched route chain via useMatches() and renders the deepest match's
// declaration into the shell's slots. SSR-safe by construction — the rail is
// route composition, resolved on the server like everything else; there is no
// provider, no effect, and nothing to clear on unmount (navigating changes
// the match, which changes what the layout renders).
//
// Declaration (in a route file):
//
//   export const Route = createFileRoute("/_app/chat")({
//     staticData: { rail: { top: ChatRailTop, chords: [...] } },
//     component: AppChat,
//   })

import type { ComponentType } from "react"
import { useMatches } from "@tanstack/react-router"

export interface ViewChord {
  /** The key hint as displayed (e.g. "⌘K", "⌘B", "/", "Esc"). */
  readonly keys: string
  /** What the chord does, tersely (e.g. "Commands", "Sidebar"). */
  readonly label: string
}

export interface ViewRailDeclaration {
  /** Top rail content (view header: status, switchers, view actions). */
  readonly top?: ComponentType
  /** Bottom rail, left — view-specific controls (zoom, reframe, modes). */
  readonly statusStart?: ComponentType
  /** Chord hints for this view, appended after the global chords. */
  readonly chords?: readonly ViewChord[]
}

// Type the staticData slot once, app-wide (TanStack module augmentation).
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    rail?: ViewRailDeclaration
  }
}

/** The deepest matched route's rail declaration (descendants override). */
export function useViewRailDeclaration(): ViewRailDeclaration {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const rail = (matches[i].staticData as { rail?: ViewRailDeclaration }).rail
    if (rail) return rail
  }
  return {}
}

/** Slot consumers — rendered by _app.tsx inside the shell's slot props. */
export function ViewRailTop() {
  const Top = useViewRailDeclaration().top
  return Top ? <Top /> : null
}

export function ViewRailStatusStart() {
  const Start = useViewRailDeclaration().statusStart
  return Start ? <Start /> : null
}

const GLOBAL_CHORDS: readonly ViewChord[] = [
  { keys: "⌘K", label: "Commands" },
  { keys: "⌘B", label: "Sidebar" },
]

/** Chord hints: the global set always shows; the view's chords append. */
export function ViewRailChords() {
  const chords = [...GLOBAL_CHORDS, ...(useViewRailDeclaration().chords ?? [])]
  return (
    <span
      className="hidden items-center gap-2.5 md:flex"
      aria-label="Keyboard shortcuts"
    >
      {chords.map((chord) => (
        <span key={chord.keys} className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted/60 px-1 font-mono text-[9px] leading-3 text-foreground">
            {chord.keys}
          </kbd>
          <span className="text-[10px]">{chord.label}</span>
        </span>
      ))}
    </span>
  )
}
