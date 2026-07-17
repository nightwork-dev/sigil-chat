import { useEffect, useRef, useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { GuideShell, type GuideNavGroup } from "@workspace/ui/components/guide/guide-shell"
import { GuideSection, Lead, P, Aside } from "@workspace/ui/components/guide/guide-content"
import { DocumentMinimap, type DocumentMinimapKindStyle, type MinimapViewport } from "@workspace/ui/components/document-minimap"
import { ScrollSpy, type ScrollSpyItem } from "@workspace/ui/components/scroll-spy"
import { ReviewMinimap, type MinimapBlock, type ReviewMarker } from "@workspace/ui/components/review-minimap"
import { Exhibit } from "@/components/showcase/exhibit"

const NAV: GuideNavGroup[] = [
  {
    label: "Guide",
    items: [
      { id: "intro", label: "Introduction" },
      { id: "scroll-spy", label: "Scroll spy" },
      { id: "prose", label: "Prose primitives" },
      { id: "nav-groups", label: "Nav groups" },
      { id: "subpages", label: "Subpages" },
      { id: "eyebrows", label: "Eyebrows" },
    ],
  },
]

// Generic document marker kinds for the demo — caller-injected, no domain
// vocabulary. Each kind is a theme-token style; the minimap ships none baked in.
const DOC_KINDS: Record<string, DocumentMinimapKindStyle> = {
  section: { className: "bg-primary hover:bg-primary/80" },
  note: { className: "bg-muted-foreground/70 hover:bg-muted-foreground" },
  figure: { className: "bg-chart-2 hover:bg-chart-2/80" },
}

const DOC_MARKERS = [
  { id: "m-intro", position: 0.04, kind: "section", label: "Introduction" },
  { id: "m-fig1", position: 0.18, kind: "figure", label: "Figure 1 — two-pane layout" },
  { id: "m-scrollspy", position: 0.34, kind: "section", label: "Scroll spy" },
  { id: "m-note1", position: 0.46, kind: "note", label: "Note: render-prop ordering" },
  { id: "m-prose", position: 0.66, kind: "section", label: "Prose primitives" },
  { id: "m-fig2", position: 0.81, kind: "figure", label: "Figure 2 — aside rail" },
  { id: "m-note2", position: 0.93, kind: "note", label: "Note: lead vs paragraph" },
]

// A caller-computed "shape of the manuscript" for the review minimap — the
// host would derive these 0..1 positions from its own document; here they're a
// static mock so the rail reads as a real page with typed review markers.
const REVIEW_BLOCKS: MinimapBlock[] = [
  { id: "b1", targetId: "s-open", position: 0.02, height: 2.2, width: 0.9, kind: "heading" },
  { id: "b2", targetId: "s-open", position: 0.06, height: 9, width: 1, kind: "prose" },
  { id: "b3", targetId: "s-open", position: 0.17, height: 6, width: 0.8, kind: "prose" },
  { id: "b4", targetId: "s-break1", position: 0.26, height: 0.4, width: 1, kind: "scene-break" },
  { id: "b5", targetId: "s-mid", position: 0.29, height: 2.2, width: 0.7, kind: "heading" },
  { id: "b6", targetId: "s-mid", position: 0.34, height: 11, width: 1, kind: "prose" },
  { id: "b7", targetId: "s-quote", position: 0.48, height: 4, width: 0.75, kind: "blockquote" },
  { id: "b8", targetId: "s-mid2", position: 0.55, height: 8, width: 1, kind: "prose" },
  { id: "b9", targetId: "s-note", position: 0.66, height: 3, width: 0.6, kind: "stage-note" },
  { id: "b10", targetId: "s-end", position: 0.72, height: 2.2, width: 0.85, kind: "heading" },
  { id: "b11", targetId: "s-end", position: 0.77, height: 13, width: 1, kind: "prose" },
  { id: "b12", targetId: "s-end", position: 0.93, height: 5, width: 0.8, kind: "prose" },
]

const REVIEW_MARKERS: ReviewMarker[] = [
  { id: "mk1", targetId: "s-open", position: 0.09, kind: "changed", label: "Reworded opening line" },
  { id: "mk2", targetId: "s-mid", position: 0.32, kind: "annotation", label: "Reviewer note: tighten pacing", count: 2 },
  { id: "mk3", targetId: "s-quote", position: 0.49, kind: "new", label: "New epigraph added" },
  { id: "mk4", targetId: "s-note", position: 0.67, kind: "deleted", label: "Cut stage direction" },
  { id: "mk5", targetId: "s-end", position: 0.82, kind: "changed", label: "Revised final paragraph" },
]

const SCROLL_SPY_ITEMS: ScrollSpyItem[] = [
  { id: "scroll-spy-overview", label: "Overview" },
  { id: "scroll-spy-behavior", label: "Active section" },
  { id: "scroll-spy-hashes", label: "Shareable links", depth: 1 },
]

export function GuideShowcase() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [lastJump, setLastJump] = useState<string | null>(null)
  const [lastReviewJump, setLastReviewJump] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollSpyRef = useRef<HTMLDivElement | null>(null)
  // No default viewport (undefined = no band) until the real scroll geometry
  // is measured — a hardcoded fallback here would reintroduce the same
  // "band doesn't reflect the container" bug this rewire exists to fix.
  const [viewport, setViewport] = useState<MinimapViewport | undefined>(undefined)

  // Derive the minimap's viewport from GuideShell's actual scroll container.
  // This is a legitimate useEffect case (external DOM subscription, not
  // derived state computable via useMemo): scroll position lives on the DOM
  // node, not in React state, until something reads it here.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let rafId: number | null = null
    const measure = () => {
      rafId = null
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= 0) return
      setViewport({
        start: scrollTop / scrollHeight,
        end: (scrollTop + clientHeight) / scrollHeight,
      })
    }
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(measure)
    }

    measure()
    el.addEventListener("scroll", onScroll)
    window.addEventListener("resize", onScroll)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      el.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  // The minimap only ever emits intent (see DocumentMinimap's
  // onViewportChange contract) — this is what actually scrolls the
  // container. The subsequent "scroll" event re-measures and feeds the
  // settled viewport back in, closing the controlled loop.
  const handleViewportChange = (next: MinimapViewport) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = next.start * el.scrollHeight
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 border-b border-border">
        <GuideShell nav={NAV} pathname={pathname} linkComponent={Link} scrollRef={scrollRef}>
          {(registerRef) => (
            <>
              <GuideSection id="intro" title="GuideShell" eyebrow="Extracted" registerRef={registerRef}>
                <Lead>
                  A two-pane shell for docs-style reading — sticky scroll-spy nav on
                  the left, a scrollable prose column on the right.
                </Lead>
                <P>
                  Scroll this column and watch the left nav highlight follow —
                  that&apos;s an IntersectionObserver watching every registered
                  section, not a manual scroll handler.
                </P>
              </GuideSection>

              <GuideSection id="scroll-spy" title="Scroll spy" registerRef={registerRef}>
                <P>
                  Each <code>GuideSection</code> registers its own DOM ref via the
                  <code>registerRef</code> render-prop GuideShell forwards. No
                  section needs to know about any other section.
                </P>
                <Aside title="Why a render-prop">
                  Registration has to happen during render, before the
                  IntersectionObserver attaches — a render-prop keeps that
                  ordering explicit instead of relying on effect timing.
                </Aside>
              </GuideSection>

              <GuideSection id="prose" title="Prose primitives" registerRef={registerRef}>
                <Lead>Lead is the opening line of a section — slightly larger.</Lead>
                <P>P is the workhorse paragraph weight, muted by default.</P>
                <Aside>Aside is a soft side-note: a left rail, not a competing card.</Aside>
              </GuideSection>

              <GuideSection id="nav-groups" title="Nav groups" registerRef={registerRef}>
                <P>
                  The left sidebar takes an array of <code>GuideNavGroup</code>, each with
                  a <code>label</code> and its own list of <code>items</code>. A single-group
                  page (like this one) renders one labeled header; a longer guide can pass
                  several groups to break a large nav into named sections instead of one
                  long undifferentiated list.
                </P>
                <P>
                  Group labels are rendered as small uppercase kickers with a hairline rule
                  trailing off to the right — the same visual language as the section
                  <code>eyebrow</code> below, so the nav and the content column read as one
                  system rather than two competing typographic voices.
                </P>
                <Aside title="Why not a tree">
                  Nav items support one level of <code>subsections</code> for in-page anchors,
                  but groups themselves don&apos;t nest — a flat list of labeled groups is
                  easier to scan than a collapsing tree, and most guides don&apos;t have
                  enough structure to need more than two levels anyway.
                </Aside>
              </GuideSection>

              <GuideSection id="subpages" title="Subpages" registerRef={registerRef}>
                <P>
                  Above the section nav, an optional <code>subpages</code> prop renders a
                  small tab switcher between sibling guide pages — think "Guide" versus
                  "API Reference" versus "Changelog" for the same feature. Each tab is a
                  <code>{`{ to, label, exact? }`}</code> pair rendered through the
                  <code>linkComponent</code> you already pass for in-page nav links.
                </P>
                <P>
                  The active tab is derived by comparing the current <code>pathname</code>
                  against each tab&apos;s <code>to</code>: an exact match when <code>exact</code>
                  is set, a prefix match otherwise, so a nested route under a subpage still
                  highlights its parent tab.
                </P>
                <Aside title="This demo has none">
                  This showcase page passes no <code>subpages</code>, which is why you only
                  see the section list — the tab row simply doesn&apos;t render when the prop
                  is omitted, rather than rendering empty.
                </Aside>
              </GuideSection>

              <GuideSection id="eyebrows" title="Eyebrows" eyebrow="Detail" registerRef={registerRef}>
                <P>
                  This section&apos;s heading has an <code>eyebrow</code> — the small
                  "Detail" kicker above the title, same treatment the very first section
                  uses ("Extracted"). It&apos;s optional per-section, not a running header,
                  so use it to flag the handful of sections that need a label — a status, a
                  category, a difficulty — and leave the rest without one.
                </P>
                <P>
                  Overusing it flattens the signal: if every section has an eyebrow, none of
                  them stand out, and the kicker starts reading as decoration instead of
                  information.
                </P>
              </GuideSection>
            </>
          )}
        </GuideShell>
      </div>

      <div className="grid shrink-0 gap-4 p-4 lg:grid-cols-2">
        <Exhibit title="Document Minimap" subtitle="caller-styled markers · jump-to · draggable viewport band" installName="document-minimap">
          <div className="flex gap-4">
            {/* The rail: a narrow vertical track. Height is caller-controlled;
                the minimap fills whatever box it's placed in. */}
            <div className="h-44 w-9 shrink-0">
              <DocumentMinimap
                markers={DOC_MARKERS}
                kindStyles={DOC_KINDS}
                viewport={viewport}
                onJump={setLastJump}
                onViewportChange={handleViewportChange}
              />
            </div>
            <div className="flex flex-col justify-center gap-1.5 text-xs text-muted-foreground">
              <p>
                A right-rail overview. Markers are styled by caller-injected <code>kind</code> (here:
                <span className="font-mono text-primary"> section</span>,
                <span className="font-mono text-chart-2"> figure</span>,
                <span className="font-mono"> note</span>); the band tracks the panel&apos;s real scroll
                position above — drag it, or click the track, to scrub the panel.
              </p>
              <p>
                {lastJump ? (
                  <>Last jump: <span className="font-mono text-foreground">{lastJump}</span></>
                ) : (
                  "Click or tab to a marker, then Enter to jump."
                )}
              </p>
            </div>
          </div>
        </Exhibit>

        <Exhibit title="Scroll Spy" subtitle="active section · hash links · responsive selector" installName="scroll-spy">
          <ScrollSpy.Root items={SCROLL_SPY_ITEMS} scrollRootRef={scrollSpyRef}>
            <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 max-sm:grid-cols-1">
              <ScrollSpy.List className="max-sm:hidden" />
              <ScrollSpy.Select className="sm:hidden" />
              <div ref={scrollSpyRef} className="h-44 overflow-y-auto rounded-md border border-border px-3">
                <section id="scroll-spy-overview" className="min-h-36 scroll-mt-2 py-3">
                  <h3 className="text-sm font-medium text-foreground">Overview</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Use the list to jump between sections. The active item follows this panel as it scrolls.
                  </p>
                </section>
                <section id="scroll-spy-behavior" className="min-h-36 scroll-mt-2 border-t border-border py-3">
                  <h3 className="text-sm font-medium text-foreground">Active section</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    IntersectionObserver tracks a narrow band near the top without a manual scroll handler.
                  </p>
                </section>
                <section id="scroll-spy-hashes" className="min-h-36 scroll-mt-2 border-t border-border py-3">
                  <h3 className="text-sm font-medium text-foreground">Shareable links</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Navigation updates the URL hash so the current section can be copied and revisited.
                  </p>
                </section>
              </div>
            </div>
          </ScrollSpy.Root>
        </Exhibit>

        <Exhibit
          title="Review Minimap"
          subtitle="document shape + typed review markers · changed / new / deleted / annotation, semantic tones"
          installName="review-minimap"
          className="lg:col-span-2"
        >
          <div className="flex gap-4">
            {/* Override the rail's page-level chrome (sticky, full-viewport
                height, hidden below xl) so it reads inside this card. In a real
                page it pins to the viewport and its band tracks window scroll. */}
            <ReviewMinimap
              blocks={REVIEW_BLOCKS}
              markers={REVIEW_MARKERS}
              onSelect={setLastReviewJump}
              density="comfortable"
              className="static block h-64"
            />
            <div className="flex flex-1 flex-col justify-center gap-2 text-xs text-muted-foreground">
              <p>
                A compressed picture of a long draft: the bars are the content&apos;s{" "}
                <em>shape</em> (headings, prose, a scene break, a blockquote), and the gutter markers flag
                where review touched it. Click a marker to jump to that passage.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]">
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-warning" /> changed</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-success" /> new</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-destructive" /> deleted</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" /> annotation</span>
              </div>
              <p>
                {lastReviewJump ? (
                  <>Jumped to: <span className="font-mono text-foreground">{lastReviewJump}</span></>
                ) : (
                  "Click a gutter marker to select its target."
                )}
              </p>
            </div>
          </div>
        </Exhibit>
      </div>
    </div>
  )
}
