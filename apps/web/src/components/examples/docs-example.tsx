// Content for /examples/docs — a real documentation-site layout built on
// GuideShell, demonstrating Sigil as a docs-site generator. The five
// sections below paraphrase this design system's five-axis framework
// (tokens, tone, registers, interaction cores, density) into
// reader-friendly prose.

import { Link, useRouterState } from "@tanstack/react-router"
import { GuideShell, type GuideNavGroup } from "@workspace/ui/components/guide/guide-shell"
import { GuideSection, Lead, P, Aside } from "@workspace/ui/components/guide/guide-content"
import { CodeBlock } from "@workspace/ui/components/code-block"
import { SITE } from "@/lib/site"

const NAV: GuideNavGroup[] = [
  {
    label: SITE.name,
    items: [
      { id: "overview", label: "Overview" },
      { id: "tokens", label: "Tokens" },
      { id: "tone", label: "Tone" },
      { id: "registers", label: "Registers" },
      { id: "cores", label: "Interaction cores" },
      { id: "density", label: "Density" },
    ],
  },
]

const TOKEN_SNIPPET = `.theme-midnight {
  --primary: oklch(0.72 0.09 220);
  --background: oklch(0.16 0.02 250);
  --border: oklch(0.28 0.02 250);
}`

const TONE_SNIPPET = `<Meter value={0.82} color="warning" />
<Meter value={0.82} color="danger" />  // alias for "destructive"`

export function DocsExample() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    // GuideShell scrolls internally, so it needs a bounded height. The
    // /examples layout is document-scroll (min-h-svh), which would leave
    // h-full collapsed — so pin to the viewport minus the h-9 (2.25rem) nav
    // strip, giving the two-pane scroll-spy its own scroll region.
    <div className="h-[calc(100svh_-_2.25rem)]">
      <GuideShell nav={NAV} pathname={pathname} linkComponent={Link}>
        {(registerRef) => (
          <>
            <GuideSection id="overview" title="A five-axis design language" eyebrow="Overview" registerRef={registerRef}>
              <Lead>
                {SITE.name} isn't one style — it's five independent axes that every
                component picks a position on. Once you can name the axis a
                component is varying, most "should this look different" questions
                answer themselves.
              </Lead>
              <P>
                The axes are tokens, tone, control registers, interaction cores, and
                density. They compose: a Knob is an instrument-register component
                using a bounded-vector core, styled through the same tone tokens as
                everything else.
              </P>
            </GuideSection>

            <GuideSection id="tokens" title="Tokens" eyebrow="Axis 1" registerRef={registerRef}>
              <P>
                Every color in the system is a CSS variable, not a hard-coded
                value. A theme is just a class on <code>{"<html>"}</code> that
                overrides the same variable names — swapping <code>theme-amber</code>{" "}
                for <code>theme-midnight</code> repaints the whole app with zero
                component changes.
              </P>
              <CodeBlock code={TOKEN_SNIPPET} />
              <P>
                Seven themes ship today, each a distinct thermal envelope — warm
                near-black amber, cool blue-teal midnight, oxidized copper — but the
                mechanism doesn't care how many exist. A component that reaches for
                a raw Tailwind color instead of a token is the one thing that breaks
                this contract.
              </P>
            </GuideSection>

            <GuideSection id="tone" title="Tone" eyebrow="Axis 2" registerRef={registerRef}>
              <P>
                Tone is the separate, smaller vocabulary layered on top of tokens
                for semantic state: <code>success</code>, <code>warning</code>,{" "}
                <code>destructive</code>, <code>info</code>, <code>muted</code>, and{" "}
                <code>primary</code> for emphasis that isn't a health state. Every
                custom component maps its own state names onto these six — aliases
                like <code>danger</code> or <code>active</code> resolve to the
                canonical tone so generated call sites don't have to memorize exact
                spelling.
              </P>
              <CodeBlock code={TONE_SNIPPET} />
              <Aside title="Why not raw color">
                A status color that sometimes means "error" and sometimes means
                "brand accent" has taught the viewer nothing. Tone exists so one
                color always means one thing everywhere it shows up.
              </Aside>
            </GuideSection>

            <GuideSection id="registers" title="Registers" eyebrow="Axis 3" registerRef={registerRef}>
              <P>
                A control's register is the register of surface it belongs to:
                ordinary form controls, dense tweak-panel controls, or physical
                instrument-panel controls (knobs, faders, LEDs). The same
                underlying value can be edited by a Slider, a CompactSlider, or a
                Knob — the register says which one belongs on a given screen.
              </P>
              <P>
                Registers don't blend freely. A form can degrade into a tweak
                control under space pressure, but an instrument control is chosen
                deliberately — a Fader never silently becomes a CompactSlider just
                because the viewport narrowed.
              </P>
            </GuideSection>

            <GuideSection id="cores" title="Interaction cores" eyebrow="Axis 4" registerRef={registerRef}>
              <Lead>
                Underneath the register, every interactive control is a projection
                of one of five state models.
              </Lead>
              <ul className="ml-4 list-disc space-y-1.5 text-sm text-muted-foreground marker:text-primary/60">
                <li><span className="text-foreground">Bounded vector</span> — a value inside a domain (sliders, knobs, XY pads).</li>
                <li><span className="text-foreground">Relative delta</span> — unbounded, speed-scaled scrubbing.</li>
                <li><span className="text-foreground">Interval</span> — a lo/hi pair (range sliders).</li>
                <li><span className="text-foreground">Draft/commit</span> — an uncommitted value layered over any core.</li>
                <li><span className="text-foreground">Discrete index</span> — enumerated positions with detents.</li>
              </ul>
              <P>
                A Knob and an XY pad look nothing alike, but they're the same
                bounded-vector core rendered through angular vs. planar geometry.
                The shared core means keyboard support, clamping, and drag handling
                only have to be correct once.
              </P>
            </GuideSection>

            <GuideSection id="density" title="Density" eyebrow="Axis 5" registerRef={registerRef}>
              <Lead>
                Density is the responsive mechanism, not a cosmetic size prop.
              </Lead>
              <P>
                One scale — <code>lg / md / sm / xs</code> — spans the form and
                tweak registers. Because every control in a density ladder shares
                the same interaction core, a bounded scalar can degrade from a full
                slider-plus-input down to a bare scrubber-style readout as space
                shrinks, with no behavior change underneath.
              </P>
              <Aside title="Where density lives">
                Density selection belongs in the molecule that composes controls,
                never in the atom itself — a Slider always renders as a Slider.
                It's the wrapping molecule that decides whether this screen gets a
                Slider or a CompactSlider.
              </Aside>
            </GuideSection>
          </>
        )}
      </GuideShell>
    </div>
  )
}
