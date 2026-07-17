---
name: sigil-cli
description: Use when scaffolding a project from this template or turning a .tsx into a distributable HTML report/site. Triggers on "sigil render", "sigil create", "render this report", "make a standalone/self-contained HTML", "generate a report", "portable HTML", or when writing a report .tsx under reports/. Covers the CLI commands, the defineReport authoring pattern, image inlining, ArticleShell for long-form, the always-hydrates render (no flags), and the SSR/hydration gotchas.
---

# sigil CLI — hard rules

`packages/cli` (bin `sigil`) is VENDORED `sigil-design` tooling. Nothing
under `apps/` or `packages/*/src` imports it — `docs/guides/trimming-the-template.md`
lists it as delete-freely if you don't use the CLI standalone. If
`packages/cli` is deleted, DELETE this skill (and the `.claude/skills`
mirror) in the same change. Every rule below is a requirement while it's
still vendored.

## Commands

- Scaffold: `node packages/cli/dist/sigil.js create <name>`
- Render: `node packages/cli/dist/sigil.js render <file.tsx> --out <file.html>`
- Check: `node packages/cli/dist/sigil.js report check <file.tsx>`
- If `dist/` is stale, FIRST run `pnpm --filter sigil build`.
- render flags: `--out --cwd --title --summary --preview --public-url --preview-url --strict`.

## What render does — DO NOT fight it

1. Output is ALWAYS one self-contained HTML: SSR markup + inlined CSS + inlined
   local images (data URLs) + inlined hydration JS. Zero network requests.
2. There is NO interactivity flag and NO `"use client"` needed. It ALWAYS
   hydrates. Just write normal React — hooks, state, handlers, interactive
   `@workspace/ui` components — and it works in the output.
3. Every output ships React inlined (tens of KB of JS). Do not attempt to strip
   it. That is the intended behavior.
4. It degrades gracefully: SSR markup is complete, so the report displays even
   with `<script>` stripped.
5. Light mode is AUTOMATIC — no report-side code. The pipeline imports the app's
   `themes.css` (`.theme-*.light` overrides, `existsSync`-guarded), injects a
   pre-paint no-flash `<script>` that reads `localStorage["sigil-report-mode"]`
   then OS `prefers-color-scheme` and sets `.light`/`.dark` on `<html>`, and
   injects a sun/moon toggle OUTSIDE `#sigil-root`. Write reports in theme
   tokens (`bg-background`, `text-foreground`, `border`, …) and both modes work.
   Do NOT hardcode a mode or add your own toggle.

## Authoring rules

1. A report = a `.tsx` with a DEFAULT-exported React component.
2. Add metadata: `export const report = defineReport({ title, summary, tags })`
   from `sigil/report`. This drives `<title>`, OG tags, and the
   `#sigil-report-manifest`. `title` + `summary` are required for `--strict`.
3. Compose with `@workspace/ui` components. Theme tokens only — NO raw palette
   (design-lint applies).
4. Images: reference LOCAL files with relative paths (`./diagrams/x.svg`). They
   inline as data URLs automatically. Do NOT use `http(s)://` image URLs (they
   fail `--strict` and break the self-contained guarantee).
5. Long-form / chaptered docs: use
   `@workspace/ui/components/guide/article-shell` (`ArticleShell.Root` with
   `chapters:{id,title}[]`, plus `Section/Lead/P/Callout/Aside/Figure/List`).
   Every `Section` needs an `id`. Its scrollspy is a React hook — correct under
   hydration.

## Forbidden / gotchas

1. DO NOT add interactivity via an inline `<script>` in the report — hydration
   clobbers it. Use React hooks/state. (ArticleShell's scrollspy is a
   `useEffect`+IntersectionObserver hook for exactly this reason.)
2. DO NOT put SSR-hostile components (recharts; anything with module-level-counter
   DOM ids) directly in a report — they throw React #418/#423 hydration
   mismatches. Wrap in `ClientOnly` or omit.
3. Installed `sigil` MUST render outside this repo using its bundled template
   and runtime dependencies. Do not require `--cwd` merely to locate the
   toolchain; use it only to override source provenance/project rooting.

## Verification — REQUIRED before claiming done

1. `pnpm --filter sigil build` → 0.
2. Run `sigil render`; confirm it wrote the `.html` (note the reported size).
3. OPEN THE OUTPUT FILE OFFLINE (real browser / Playwright on the local file,
   network disabled). Confirm ALL of:
   - it displays correctly;
   - any interactivity responds (click/drag → state changes);
   - console is clean — NO React #418/#423 hydration mismatch;
   - ZERO network requests — grep the html: exactly one inline
     `<script type="module">`, images as `data:` URLs, no external
     `src=`/`href=` `http(s)`.
     Do NOT claim done from the render exit code alone. Open the file.
