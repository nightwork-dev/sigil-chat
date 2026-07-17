---
name: sigil-cli
description: Use when scaffolding a project from this template or turning a .tsx into a distributable HTML report/site. Triggers on "sigil render", "sigil create", "render this report", "make a standalone/self-contained HTML", "generate a report", "portable HTML", or when writing a report .tsx under reports/. Covers the CLI commands, the defineReport authoring pattern, image inlining, ArticleShell for long-form, the always-hydrates render (no flags), and the SSR/hydration gotchas.
---

# sigil CLI

`packages/cli` (bin `sigil`, package `sigil`) is the repo's CLI. Two jobs:
scaffold a new project from this template, and render a `.tsx` report into ONE
self-contained, distributable HTML file.

## Commands

```bash
# Scaffold a new app from the template (manifest-driven; rewrites name + portless host)
node packages/cli/dist/sigil.js create my-app

# Render a .tsx report → one self-contained HTML (the main event)
node packages/cli/dist/sigil.js render reports/weekly.tsx --out dist/weekly.html

# Validate a report's metadata without writing output
node packages/cli/dist/sigil.js report check reports/weekly.tsx
```

`render` flags: `--out <file>`, `--cwd <path>`, `--title`, `--summary`,
`--preview <img>`, `--public-url <url>`, `--preview-url <url>`, `--strict`.
(Build the CLI first if `dist/` is stale: `pnpm --filter sigil build`.)

## What `render` produces — always self-contained, always hydrated

There is **no `--interactive` flag** and no `"use client"` ceremony. A
self-contained HTML _is_ the whole point, so every render:

- SSRs the report (`renderToString`) into `<div id="sigil-root">`,
- inlines the design-system **CSS**,
- inlines every **local image** as a `data:` URL (reference them with relative
  paths — `./diagrams/x.svg` — and they embed automatically),
- builds a client bundle (React bundled in) and inlines it as one
  `<script type="module">`, so the page **hydrates to full interactivity offline**.

The result is one file with **zero network requests**. It **degrades
gracefully**: the SSR markup is complete, so the report still _displays_ even if
a viewer strips `<script>` (email) — the JS only enhances.

Consequence: every output ships React (tens of KB of JS inlined). That's the
deal; don't try to avoid it. Interactivity "just works" — use React hooks,
state, event handlers, and interactive `@workspace/ui` components (Slider,
Gauge, Meter, Stepper, …) directly in the report; the render hydrates them.

### Light mode ships automatically — you don't opt in

Every render is light/dark capable with no report-side code:

- The pipeline imports the app's `themes.css` (the `.theme-*.light` envelope
  overrides) alongside `globals.css`, so the light tokens are present. It's
  guarded by `existsSync` — a stripped project with no `themes.css` still
  renders (dark-only).
- A pre-paint **no-flash `<script>`** in `<head>` resolves the mode from a saved
  override (`localStorage["sigil-report-mode"]`) → else the OS
  `prefers-color-scheme` — setting exactly one of `.light`/`.dark` on `<html>`
  (the `.theme-*` envelope class is left alone) before first paint.
- A fixed sun/moon **toggle** is injected _outside_ `#sigil-root` so React
  hydration never reconciles it. It flips the class and persists the choice.

Write reports in theme tokens (`bg-background`, `text-foreground`, `border`,
`text-muted-foreground`, …) and both modes just work. Caveat: `<canvas>`
components that read theme colors once (Gauge, Oscilloscope, …) don't recolor on
a live toggle until they re-render — fine for a static report, and they're
correct in whichever mode the page first painted.

## Authoring a report

A report is a `.tsx` with a default-exported React component and an optional
`report` metadata export:

```tsx
import { defineReport } from "sigil/report";
import { Card } from "@workspace/ui/components/card";

export const report = defineReport({
  title: "Weekly Run Review",
  summary: "Throughput, failures, and next actions.",
  tags: ["agents", "qa"],
});

export default function Weekly() {
  return (
    <main className="mx-auto max-w-2xl p-8 bg-background text-foreground">
      <h1>Weekly Run Review</h1>
      <img src="./throughput.png" alt="Throughput trend" /> {/* inlined */}
    </main>
  );
}
```

- Compose with `@workspace/ui` design-system components; use theme tokens, not
  raw palette (design-lint applies).
- `defineReport` metadata drives the `<title>`, Open Graph tags, and the
  `#sigil-report-manifest` JSON envelope in the output.

### Long-form articles → use `ArticleShell`

For chaptered/long-form docs, use
`@workspace/ui/components/guide/article-shell` — a two-pane layout with a sticky
chapter TOC and a **React scrollspy hook** (works because the render hydrates).
`ArticleShell = { Root, Section, Subhead, Lead, P, Callout, Aside, List, Item,
Figure, Divider }`. `Figure` centers a diagram + caption; `Root` takes
`chapters: {id, title}[]` and renders the scroll-spied TOC. Each `Section` gets
an `id` so the TOC anchors and scrollspy hook onto it.

## Gotchas (each has cost a real debugging loop)

- **SSR-hostile components mismatch on hydration.** recharts (and anything that
  generates DOM ids from a module-level counter) can throw React #418/#423 in
  the hydrated output. Wrap them in `ClientOnly` or keep them out of reports.
- **Render-anywhere uses the packaged toolchain.** In this checkout, `render`
  discovers the local Sigil runtime. An installed `sigil` package uses its
  bundled template and runtime dependencies, so it can render an arbitrary
  `.tsx` from another directory without `--cwd`. Use `--cwd` only when source
  provenance should be rooted somewhere other than the report's nearest project.
- **Scrollspy / interactivity must be React, not an inline `<script>`.** The
  render hydrates, so a parse-time inline script gets clobbered by React
  reconciliation — use hooks/state (this is why ArticleShell's scrollspy is a
  `useEffect`+IntersectionObserver hook, not a script).
- **`--strict`** fails on external `http(s)` resources, unembeddable images,
  missing title/summary/preview-alt, or output over the size ceiling. Use
  `report check` to validate without writing.

## Verify a render (don't trust "should work")

OPEN THE OUTPUT FILE OFFLINE (a real browser / Playwright on the local file with
network disabled) and confirm: it displays, any interactivity responds, the
console is clean (no hydration mismatch), and there are ZERO network requests
(grep the html: one inline `<script type="module">`, images as `data:` URLs, no
external `src=`/`href=` http(s)).
