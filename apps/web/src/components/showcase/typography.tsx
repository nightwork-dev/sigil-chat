import { Exhibit } from "@/components/showcase/exhibit"
import { CodeBlock } from "@workspace/ui/components/code-block"
import { Typeset } from "@workspace/ui/components/typeset"
import { ReaderSurface } from "@workspace/ui/components/layouts/reader-surface"

const CODE_SAMPLE = JSON.stringify(
  { name: "Sigil Design", version: 2, stable: true, deprecated: null, tags: ["ui", "tokens"] },
  null,
  2
)

// The two-register type system used throughout this template: DM Sans
// (proportional, for content a human reads) and JetBrains Mono (for
// infrastructure — data, code, file paths, numeric readouts). Which one a
// piece of text uses is itself information — see the ux-design-language
// skill's "Typography register" rule.

const SCALE = [
  { label: "text-2xl", className: "text-2xl", sample: "The quick brown fox" },
  { label: "text-xl", className: "text-xl", sample: "The quick brown fox" },
  { label: "text-lg", className: "text-lg", sample: "The quick brown fox" },
  { label: "text-base", className: "text-base", sample: "The quick brown fox" },
  { label: "text-sm", className: "text-sm", sample: "The quick brown fox" },
  { label: "text-xs", className: "text-xs", sample: "The quick brown fox" },
  { label: "text-[10px]", className: "text-[10px]", sample: "The quick brown fox" },
  { label: "text-[9px]", className: "text-[9px]", sample: "The quick brown fox" },
]

const WEIGHTS = [
  { label: "font-normal", className: "font-normal" },
  { label: "font-medium", className: "font-medium" },
  { label: "font-semibold", className: "font-semibold" },
  { label: "font-bold", className: "font-bold" },
]

export function TypographyShowcase() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
      <Exhibit title="Font Stack" subtitle="proportional vs. monospace">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-base">DM Sans — content a human reads</span>
            <span className="font-mono text-[10px] text-muted-foreground">font-sans</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-base">JetBrains Mono — data, code, paths</span>
            <span className="font-mono text-[10px] text-muted-foreground">font-mono</span>
          </div>
        </div>
      </Exhibit>

      <Exhibit title="Headings" subtitle="h1–h4, tracking-tight">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium tracking-tight">Heading One</h1>
          <h2 className="text-xl font-medium tracking-tight">Heading Two</h2>
          <h3 className="text-lg font-medium tracking-tight">Heading Three</h3>
          <h4 className="text-base font-medium tracking-tight">Heading Four</h4>
        </div>
      </Exhibit>

      <Exhibit title="Type Scale" subtitle="every text size in use, sans">
        <div className="flex flex-col gap-1.5">
          {SCALE.map((s) => (
            <div key={s.label} className="flex items-baseline gap-3">
              <span className="w-24 shrink-0 font-mono text-[9px] text-muted-foreground">{s.label}</span>
              <span className={s.className}>{s.sample}</span>
            </div>
          ))}
        </div>
      </Exhibit>

      <Exhibit title="Weights" subtitle="normal → bold">
        <div className="flex flex-col gap-1.5">
          {WEIGHTS.map((w) => (
            <div key={w.label} className="flex items-baseline gap-3">
              <span className="w-28 shrink-0 font-mono text-[9px] text-muted-foreground">{w.label}</span>
              <span className={`text-base ${w.className}`}>The quick brown fox</span>
            </div>
          ))}
        </div>
      </Exhibit>

      <Exhibit title="Text Colors" subtitle="semantic tokens">
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-foreground">text-foreground — primary content</span>
          <span className="text-muted-foreground">text-muted-foreground — secondary content</span>
          <span className="text-primary">text-primary — active / on-state</span>
          <span className="text-destructive">text-destructive — error / danger</span>
        </div>
      </Exhibit>

      <Exhibit title="Typeset" subtitle="semantic HTML and rendered Markdown" installName="typeset" className="lg:col-span-2">
        <Typeset variant="reading" className="max-w-prose">
          <h2>Reading rhythm without per-element classes</h2>
          <p>
            Typeset gives headings, paragraphs, <strong>emphasis</strong>, <a href="#typeset-demo">links</a>, and
            <code>inline code</code> one theme-aware rhythm while the surrounding layout continues to own the measure.
          </p>
          <blockquote>
            <p>The same semantic output can sit in a manuscript, a knowledge page, or a compact message.</p>
          </blockquote>
          <ul>
            <li>Use the reading preset for manuscripts and essays.</li>
            <li>Use compact rhythm where Markdown appears inside application chrome.</li>
          </ul>
        </Typeset>
      </Exhibit>

      <Exhibit title="Numeric / Mono Readouts" subtitle="tabular-nums for stable digit width">
        <div className="flex flex-col gap-1.5 font-mono text-xs">
          <div className="flex justify-between tabular-nums">
            <span className="text-muted-foreground">requests</span>
            <span>12,847</span>
          </div>
          <div className="flex justify-between tabular-nums">
            <span className="text-muted-foreground">latency</span>
            <span>42ms</span>
          </div>
          <div className="flex justify-between tabular-nums">
            <span className="text-muted-foreground">uptime</span>
            <span>99.98%</span>
          </div>
        </div>
      </Exhibit>

      <Exhibit title="Line Length" subtitle="max-w-prose for readable paragraphs">
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Long-form body copy should be constrained to a readable measure — roughly 60–75 characters per
          line — rather than stretching full-width. This paragraph is wrapped in{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">max-w-prose</code> so it wraps at a
          comfortable width regardless of the container it sits in.
        </p>
      </Exhibit>

      <Exhibit title="Code Block" subtitle="dependency-free JSON colorizer" installName="code-block">
        <CodeBlock code={CODE_SAMPLE} language="json" />
      </Exhibit>

      <Exhibit
        title="Reader Surface"
        subtitle="long-form reading frame · comfortable size + leading, measure capped to ~66ch · pair with Typeset for element styling"
        installName="reader-surface"
        className="lg:col-span-2"
      >
        <ReaderSurface measure="narrow" className="rounded-md border border-border bg-card/40 px-4">
          <Typeset variant="reading">
            <p>
              The reader surface sets the base size, line-height, and horizontal measure for continuous
              prose, so a manuscript reads like something meant to be read rather than a data panel. It
              imposes rhythm and a legible line length — not element styling.
            </p>
            <p>
              Because the frame is deliberately unopinionated about headings, lists, and links, it composes
              with a prose utility (here, <code>Typeset</code>) that owns the element treatment. Pure CSS, no
              hooks — safe to render on the server.
            </p>
          </Typeset>
        </ReaderSurface>
      </Exhibit>
    </div>
  )
}
