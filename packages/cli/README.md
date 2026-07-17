# sigil

The **Sigil CLI** — scaffold apps from this template and render portable
single-file HTML reports.

Two jobs (per `docs/specs/template-cli-and-static-report-proposal.md`):

1. **`sigil create <name>`** — scaffold a new app from the Sigil TanStack Start
   template (manifest-driven via `template.sigil.json`).
2. **`sigil render <file.tsx>`** — server-render a `.tsx` report into a
   distributable single HTML document (inlined CSS/images/metadata, Open Graph
   tags, agent-readable manifest).

## Status

- `sigil create <name>` / `create-sigil <name>` — scaffolds, installs,
  initializes Git, and optionally verifies a new app from the manifest-driven
  Sigil template. **Working.**
- `sigil render <file.tsx>` — server-renders a `.tsx` report into a portable
  always-hydrated single-file HTML with inlined CSS/images, Open Graph metadata,
  and a typed agent-readable manifest. **Working.**
- Installed packages render `.tsx` files from any directory using the bundled
  Sigil design system and build runtime; a source project does not need its own
  `apps/web`, Vite, React, or Tailwind installation.
- Explicit local previews can be validated and copied as companion artifacts;
  automated browser screenshot generation remains future work.

## Develop

The package builds publishable `sigil` and `create-sigil` binaries and exports
the report authoring helper as `sigil/report`. Publishing itself is outside this
repository task.

```bash
pnpm --filter sigil build                   # tsup → dist/
node packages/cli/dist/sigil.js --help      # run the built artifact
pnpm --filter sigil typecheck               # tsc --noEmit

# Render a report
node packages/cli/dist/sigil.js render reports/sample.tsx --out dist/sample.html
```

The CLI ships compiled JS (Node 20+ LTS has no native TypeScript), so the
built `dist/` is what we test — same artifact users run.

During repository development, render reuses the checkout toolchain. Published
packages carry the core Vite, React, Tailwind, and design-system runtime plus a
filtered template snapshot so the same command works outside this monorepo.
