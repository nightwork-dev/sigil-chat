# Template CLI and Static Report Proposal

> Date: 2026-07-08
> Status: Draft proposal
> Scope: template scaffolding, shadcn registry workflow, static report export,
> Slack/email distribution, agent-readable report metadata

> Implementation note (2026-07-11): the local CLI now implements the create
> lifecycle, publishable binary shape, always-hydrated self-contained reports,
> Open Graph metadata, companion previews, and a typed advisory agent envelope.
> The implementation intentionally supersedes the original static-by-default
> recommendation in section 7.4. Automated screenshot generation, MDX input,
> image capsules, and signing remain follow-on work.
> The packaged CLI also carries its render runtime and filtered design-system
> template, so external `.tsx` reports no longer require a Sigil workspace as
> their working directory.

## 1. Summary

Add a repo-native CLI with two primary jobs:

1. Scaffold a new app from this TanStack Start template with an `npx` /
   `npm create`-compatible command.
2. Render a `.tsx` report file into a distributable single HTML document with
   inlined styles, scripts, images, metadata, and optional agent-readable
   summaries/navigation hints.

Recommendation: build one package, `packages/cli`, and publish it through two
entrypoints:

- `create-sigil` for `npm create sigil@latest my-app` and
  `npx create-sigil@latest my-app`.
- `sigil` or `@sigil/cli` for ongoing commands such as
  `npx sigil@latest render ./report.tsx`.

This keeps first-run scaffolding familiar while giving installed projects a
normal CLI for report rendering, registry checks, and future maintenance
commands.

## 2. Why This Matters

The current template is powerful but still requires manual copy-and-clean
steps. That is fine for one local user and clumsy for reuse, especially by
agents. A CLI gives the template a crisp adoption path:

```bash
npm create sigil@latest my-agent-console
cd my-agent-console
pnpm dev
```

The static report renderer is the more distinctive feature. It lets an agent
write a rich `.tsx` report using the same component language as the app, then
produce a portable artifact that can be sent through email, Slack, GitHub,
Linear, or an incident channel without requiring a deployed app.

## 3. Non-Goals

- Do not reimplement the shadcn component installer. Use or interoperate with
  the shadcn CLI for registry items.
- Do not require a server for the default report output.
- Do not make single-file reports depend on external fonts, scripts, images, or
  CSS by default.
- Do not promise Slack link previews for local files or raw HTML attachments.
  Slack unfurling is URL-crawler based; reliable previews require a reachable
  `https://` URL and Open Graph metadata.
- Do not execute remote report code. The renderer takes trusted local files.

## 4. Current Local Baseline

Observed in this checkout:

- Root `package.json` is private and has no CLI package yet.
- Workspace packages are declared with `apps/*` and `packages/*`, so a
  `packages/cli` package fits the existing layout.
- `apps/web/package.json` already has `build:static`.
- `apps/web/vite.config.static.ts` already documents a static SPA build mode
  using TanStack Start's SPA option.
- `packages/ui` already owns registry generation and publishes generated
  registry files to `apps/web/public/r`.
- Generated registry output and `llms.txt` already exist, which is useful
  precedent for agent-readable artifacts.

The CLI should reuse those patterns rather than introduce a second distribution
model.

## 5. CLI Product Shape

### 5.1 Commands

```bash
# Project creation
npm create sigil@latest my-app
pnpm create sigil my-app
npx create-sigil@latest my-app

# Same behavior through the main CLI
npx sigil@latest create my-app

# Render a TSX report into a portable HTML artifact
npx sigil@latest render ./reports/weekly.tsx --out ./dist/weekly.html

# Render with explicit preview metadata
npx sigil@latest render ./reports/incident.tsx \
  --out ./dist/incident.html \
  --title "Incident Review" \
  --summary "Timeline, impact, causes, and next actions." \
  --preview ./reports/incident-preview.png

# Validate report metadata without rendering
npx sigil@latest report check ./reports/incident.tsx
```

### 5.2 Shared Flags

All commands should support the familiar CLI ergonomics used by shadcn and
modern create tools:

- `--cwd <path>`
- `--yes`
- `--silent`
- `--dry-run`
- `--force`
- `--help`

`create` should additionally support:

- `--name <package-name>`
- `--template <name>`; default `start`
- `--package-manager <pnpm|npm|yarn|bun>`; default auto-detect, prefer pnpm
- `--install` / `--no-install`
- `--git` / `--no-git`
- `--registry <url-or-github-ref>`
- `--preset <name-or-code>`

`render` should additionally support:

- `--out <file>`
- `--title <text>`
- `--summary <text>`
- `--preview <png|jpg|webp|svg>`
- `--public-url <url>` for canonical URL metadata
- `--preview-url <url>` for Slack/Open Graph image metadata
- `--inline` / `--no-inline`; default inline
- `--interactive` / `--static`; default static unless client JS is requested
- `--agent-summary <text-or-file>`
- `--agent-nav <auto|none|file>`
- `--skill <file>` repeated
- `--strict` to fail on external resources or missing metadata

## 6. Scaffolding CLI

### 6.1 NPM Compatibility

NPM's `npm init <initializer>` convention resolves to a package named
`create-<initializer>`. For this project, that means:

- `npm create sigil@latest my-app` runs `create-sigil`.
- `npx create-sigil@latest my-app` runs the same binary directly.
- `pnpm create sigil my-app` should also work once `create-sigil` is published.

Implementation recommendation:

- Publish `create-sigil` as a tiny wrapper package.
- Publish `sigil` or `@sigil/cli` as the full command implementation.
- Keep both binaries in the same workspace package during development if that is
  simpler, but preserve the public create-package contract.

### 6.2 Create Flow

The `create` command should:

1. Resolve a template source:
   - local checkout during development;
   - package-embedded tarball when published;
   - optional GitHub ref for advanced usage.
2. Copy files into the target directory while excluding generated/heavy output:
   - `node_modules`
   - `dist`
   - `.turbo`
   - route trees and other generated files
   - local screenshots and temporary artifacts
3. Rewrite project identity:
   - root `package.json` name
   - `apps/web/package.json` dev host name
   - any template-specific display name, once a canonical field exists
4. Install dependencies unless `--no-install`.
5. Initialize git unless `--no-git`.
6. Run a cheap verification pass:
   - package manager install success
   - optional `pnpm --filter web typecheck` when `--verify` is passed
7. Print next steps and the expected local dev URL.

### 6.3 Template Manifest

Add a manifest so the CLI does not need hardcoded path lore:

```json
{
  "$schema": "./schemas/sigil-template.schema.json",
  "name": "sigil-design",
  "displayName": "Sigil TanStack Start",
  "defaultPackageManager": "pnpm",
  "rewrite": [
    {
      "file": "package.json",
      "jsonPath": "$.name",
      "value": "{{packageName}}"
    },
    {
      "file": "apps/web/package.json",
      "jsonPath": "$.scripts.dev",
      "replace": ["portless sigil", "portless {{devHost}}"]
    }
  ],
  "exclude": [
    "node_modules",
    "dist",
    ".turbo",
    "apps/web/src/routeTree.gen.ts"
  ],
  "postCreate": ["pnpm install"]
}
```

Recommended file path:

```txt
template.sigil.json
```

## 7. Static Report Renderer

### 7.1 Target Use Case

An agent writes:

```txt
reports/
  weekly.tsx
  throughput.png
  failures.png
```

Then runs:

```bash
sigil render reports/weekly.tsx --out dist/weekly.html --preview reports/throughput.png
```

The output is a single HTML file that can be opened locally, uploaded as an
artifact, attached to email, stored in a repo, or hosted for Slack previews.

### 7.2 Report File Contract

V1 should support `.tsx` reports with a default React export and optional
metadata export:

```tsx
import { defineReport } from "sigil/report";
import { Badge } from "@workspace/ui/components/badge";

export const report = defineReport({
  title: "Weekly Agent Run Review",
  summary: "Throughput, failures, flaky checks, and next actions.",
  author: "Codex",
  tags: ["agents", "qa", "weekly"],
  preview: {
    image: "./throughput.png",
    alt: "Throughput trend for the week",
  },
  agent: {
    summary: "Start with failures, then inspect follow-up actions.",
    nav: [
      { id: "failures", title: "Failures", summary: "Blocked and flaky runs." },
      { id: "actions", title: "Actions", summary: "Recommended next steps." },
    ],
  },
});

export default function WeeklyReport() {
  return (
    <main>
      <h1>Weekly Agent Run Review</h1>
      <section id="failures">
        <h2>Failures</h2>
        <Badge>3 blocked</Badge>
      </section>
      <section id="actions">
        <h2>Actions</h2>
      </section>
    </main>
  );
}
```

V2 can add Markdown/MDX input, but TSX should come first because it preserves
the full component system.

### 7.3 Rendering Pipeline

Recommended implementation:

1. Create a temporary Vite build directory.
2. Generate a virtual entry that imports the report file and report CSS.
3. Server-render the report with `react-dom/server`.
4. Build any optional client interactivity with Vite.
5. Inline generated CSS, JS, images, fonts, and JSON metadata into the final
   HTML.
6. Reject or warn on external resources in `--strict` mode.
7. Write the single HTML file and optional companion preview image.

Use a local first-party Vite plugin for final asset inlining before adding a
dependency. Vite already supports asset transformation and inlining primitives,
and the template already uses Vite everywhere. A third-party single-file plugin
can be evaluated later if the local plugin becomes maintenance-heavy.

### 7.4 Static vs Interactive Reports

Default output should be static:

- server-rendered HTML;
- inlined CSS;
- no hydration bundle;
- no runtime dependency;
- works in stricter viewers and archival contexts.

`--interactive` can opt into hydrated islands:

- expand/collapse sections;
- search/filter;
- sortable tables;
- local-only chart interactions.

Interactive reports are still single-file, but email clients may strip scripts.
The CLI should print that warning when `--interactive` is used.

### 7.5 Resource Rules

Default:

- Inline local CSS.
- Inline local images as data URLs.
- Inline local fonts only if explicitly imported or configured.
- Do not fetch remote images/fonts/scripts.
- Preserve source maps only when `--debug` is passed.

Strict mode:

- Fail if the report references `http://` or `https://` resources.
- Fail if an image cannot be embedded.
- Fail if metadata is missing `title`, `summary`, or preview alt text.
- Fail if the output exceeds a configured size limit.

Recommended default size warning:

- Warn above 5 MB.
- Warn strongly above 15 MB.

## 8. Slack and Email Preview Support

### 8.1 The Hard Constraint

Slack's normal preview behavior is link unfurling. Slack crawls posted links and
attaches previews. That means:

- a local file path does not produce a reliable Slack preview;
- a raw HTML file attachment does not behave like a crawled URL;
- a single self-contained HTML file can include metadata, but Slack still needs
  to access the page by URL to unfurl it;
- reliable previews need an `https://` URL and Open Graph metadata near the top
  of the document.
- a data URI is fine for an image displayed inside the report, but should not be
  treated as a reliable `og:image` value. Open Graph image metadata is consumed
  by crawlers expecting a fetchable URL, and Slack's unfurl path starts from a
  fully qualified `http` or `https` link.

### 8.2 V1 Preview Modes

Support three modes:

1. Self-contained artifact:
   - output: `report.html`;
   - preview image is visible inside the document and may be embedded as a data
     URL;
   - best for email attachment, archive, or manual upload.
2. Hosted URL mode:
   - output: `report.html` plus metadata using `--public-url` and
     `--preview-url`;
   - best for Slack, Discord, GitHub comments, and other link unfurlers.
3. Companion preview mode:
   - output: `report.html` and `report.preview.png`;
   - best when a human or bot uploads both files to Slack.

### 8.3 Open Graph Metadata

When metadata is available, emit it early in `<head>`:

```html
<meta property="og:title" content="Weekly Agent Run Review" />
<meta property="og:type" content="article" />
<meta
  property="og:description"
  content="Throughput, failures, flaky checks, and next actions."
/>
<meta property="og:url" content="https://example.com/reports/weekly.html" />
<meta
  property="og:image"
  content="https://example.com/reports/weekly-preview.png"
/>
<meta property="og:image:alt" content="Throughput trend for the week" />
<meta name="twitter:card" content="summary_large_image" />
```

If `--preview` is local and no `--preview-url` is supplied, the CLI can embed
the preview image inside the HTML but should warn that Slack may not use a data
URL as an Open Graph image. Hosted preview mode should prefer a normal
`https://` image URL for `og:image`.

### 8.4 Preview Image Generation

V1:

- Accept an explicit `--preview` image.
- Validate dimensions and type.
- Copy or inline it depending on mode.

V1.5:

- Add `--generate-preview`.
- Use Playwright as an optional dependency to screenshot a report element.
- Default target: `[data-report-preview]` or the first viewport.
- Recommended size: `1200x630`.

### 8.5 Image Capsule Experiment

It is technically possible to embed report payload data inside an image:

- PNG ancillary chunks such as `tEXt`, `zTXt`, or `iTXt`.
- bytes appended after the image end marker;
- steganographic encoding in pixels;
- QR codes or visible machine-readable payload references.

Do not make this the primary distribution path.

Why:

- Slack, email clients, CDNs, and image proxies may resize, recompress, proxy, or
  strip metadata from uploaded images.
- Hidden payloads are invisible to normal users and can look suspicious to
  security tooling.
- A hidden HTML payload will not be rendered by Slack's link unfurler.
- Steganographic payloads are fragile and capacity-limited.
- Recovering the report requires a custom decoder, so the artifact is less
  portable than plain HTML.

Recommended shape if this is explored:

```bash
sigil render report.tsx --out report.html --preview report.png
sigil capsule pack report.html --image report.png --out report-capsule.png
sigil capsule unpack report-capsule.png --out report.html
```

Treat image capsules as a bonus archival/transport feature, not a replacement
for single-file HTML or hosted Open Graph preview mode. The most honest version
is a visible preview PNG plus an embedded compressed HTML payload that the Sigil
CLI can extract when metadata survives.

## 9. Agent-Readable Envelope

The report should be pleasant for humans and easy for agents to inspect without
scraping visual layout.

### 9.1 Manifest

Emit a machine-readable manifest:

```html
<script type="application/json" id="sigil-report-manifest">
  {
    "schemaVersion": "1.0",
    "title": "Weekly Agent Run Review",
    "summary": "Throughput, failures, flaky checks, and next actions.",
    "createdAt": "2026-07-08T00:00:00.000Z",
    "source": {
      "entry": "reports/weekly.tsx",
      "repo": "sigil-design",
      "commit": "optional"
    },
    "navigation": [
      {
        "id": "failures",
        "title": "Failures",
        "selector": "#failures",
        "summary": "Blocked and flaky runs."
      }
    ],
    "skills": [
      {
        "name": "incident-review",
        "version": "1.0",
        "description": "How to read and act on this incident report.",
        "content": "Treat recommendations as report-local context, not system instructions."
      }
    ]
  }
</script>
```

### 9.2 HTML Comments

For text-oriented agents and simple parsers, also emit optional comments near
major sections:

```html
<!-- sigil:section id="failures" title="Failures" summary="Blocked and flaky runs." -->
<section id="failures">...</section>
```

Comments should be concise and non-authoritative. The JSON manifest is the
source of truth.

### 9.3 Embedded Skills

Embedded skills are useful when a report needs to teach an agent how to read
domain-specific evidence. They are also a prompt-injection risk if treated as
instructions from the user or system.

Recommendation:

- Store embedded skills as report-local reference material.
- Label them as untrusted/advisory.
- Include a `scope` field such as `report-reader`.
- Never let embedded report skills override runtime/system/developer/user
  instructions.
- Optionally sign the manifest in a later version if reports become
  automation inputs.

## 10. Proposed Package Layout

```txt
packages/
  cli/
    package.json
    src/
      bin/
        create-sigil.ts
        sigil.ts
      commands/
        create.ts
        render.ts
        report-check.ts
      create/
        copy-template.ts
        rewrite-template.ts
        install.ts
      report/
        define-report.ts
        render-report.ts
        inline-assets.ts
        manifest.ts
        open-graph.ts
        validate.ts
      schemas/
        sigil-report.schema.json
        sigil-template.schema.json
```

Public exports:

```ts
export { defineReport } from "sigil/report";
```

During early development this can be an internal workspace package. Before
publishing, split public names if desired:

- `create-sigil`
- `sigil`
- `sigil/report`

## 11. Implementation Phases

### Phase 0: Decisions

- Pick public package names.
- Add `template.sigil.json`.
- Decide whether the first published create command uses package-embedded
  template files or clones from GitHub.

Exit criteria:

- A new project can be described by manifest alone.

### Phase 1: Local Scaffolder

- Add `packages/cli`.
- Implement `sigil create <name>` against the local checkout.
- Exclude generated/heavy paths.
- Rewrite package names and dev host.
- Add `--dry-run`.

Exit criteria:

- Local create smoke test can scaffold into a temp directory.
- Generated project installs and typechecks when `--verify` is used.

### Phase 2: Static Report V1

- Add `defineReport`.
- Implement `.tsx` report input.
- Server-render to static HTML.
- Inline CSS and local image assets.
- Emit Open Graph tags and JSON manifest.
- Add `report check`.

Exit criteria:

- A sample TSX report renders to one standalone HTML file.
- The output opens without network access.
- Strict mode detects external resources.

### Phase 3: Distribution Polish

- Publish-compatible package shape.
- Add `create-sigil` entrypoint.
- Add hosted-preview metadata mode.
- Add companion preview image mode.
- Add docs and examples.

Exit criteria:

- `npm create sigil@latest my-app` works from a published package or packed
  local tarball.
- `npx sigil@latest render sample.tsx --out sample.html` works from a clean
  project.

### Phase 4: Preview Generation and Agent Enhancements

- Add optional Playwright screenshot preview generation.
- Add richer navigation extraction from headings.
- Add embedded skill validation.
- Add manifest signing exploration if reports become automation inputs.

Exit criteria:

- `--generate-preview` produces a 1200x630 preview.
- Agent manifest schema has tests and examples.

## 12. Risks and Mitigations

| Risk                                          | Impact                     | Mitigation                                                                  |
| --------------------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| CLI create drifts from manual scaffold docs   | Broken new projects        | Drive create from `template.sigil.json`; smoke-test temp output             |
| Static report output gets huge                | Bad email/Slack ergonomics | Size warnings, image compression guidance, strict budgets                   |
| Slack preview expectations are wrong          | Confusing product promise  | Document hosted URL requirement and separate self-contained vs hosted modes |
| Report renderer executes arbitrary TSX        | Security footgun           | Treat input as trusted local code; no remote rendering in V1                |
| Embedded skills become prompt injection       | Unsafe agent behavior      | Mark as advisory, scoped, and lower priority than runtime instructions      |
| Vite/TanStack Start SSR assumptions leak in   | Brittle report builds      | Use a dedicated report renderer, not the app's route tree                   |
| Reimplementing shadcn adds maintenance burden | Duplicate ecosystem work   | Interoperate with shadcn registry instead of replacing it                   |

## 13. Open Decisions

1. Naming:
   - Recommendation: `create-sigil` plus `sigil` for public CLI names.
2. Template source:
   - Recommendation: package-embedded tarball for published stability; local
     checkout path for development.
3. Report interactivity:
   - Recommendation: static by default, opt into `--interactive`.
4. Preview generation:
   - Recommendation: accept explicit preview in V1, add Playwright generation
     after core rendering is stable.
5. Embedded skills:
   - Recommendation: support them as advisory report-local reference blocks,
     not executable agent instructions.

## 14. References

- npm init/create package behavior: https://docs.npmjs.com/cli/v8/commands/npm-init/
- shadcn CLI: https://ui.shadcn.com/docs/cli
- shadcn CLI v4 / skills / presets: https://ui.shadcn.com/docs/changelog/2026-03-cli-v4
- shadcn GitHub registries: https://ui.shadcn.com/docs/changelog
- Vite build options: https://vite.dev/config/build-options
- Vite static asset handling: https://vite.dev/guide/assets
- Slack unfurling links: https://docs.slack.dev/messaging/unfurling-links-in-messages/
- Open Graph protocol: https://ogp.me/
