# DEVKIT shape pass — spec-viewer & context-flag

> Status: scoping only. No code in this doc or its companion commit.
> Answers the RFC section of `tapestry-registry-hitlist.md` for the two
> remaining DEVKIT items. Implementation is a separate, future tranche.

## 1. `spec-viewer` — markdown specs, nav tree + doc view

### Component/module boundary

Registry item (`packages/ui`, domain-free):
- `SpecViewer` — Root/Parts compound (RULE 1 applies: nav tree and doc pane
  are two independently-composable regions sharing one data source).
  `SpecViewer.Root({ docs, activeId, onNavigate })`, `.Nav` (tree of
  `{ id, title, children? }`), `.Doc` (renders the active doc's parsed body).
- A markdown-to-render-tree parser lives in `lib/spec-markdown.ts` — pure,
  no DOM, returns a typed AST-ish node list the `.Doc` part renders. Pure
  function → directly unit-testable, same convention as `lib/minimap.ts`
  and this tranche's `lib/spotlight-focus.ts`.
- Heading extraction for the nav tree (`# / ## / ###` → tree nodes) is a
  second pure function over the same parse output, not a second parser.

App glue (Tapestry-side, NOT registry):
- Loading `.md` files from disk/repo into `{ id, title, body }[]` (a Vite
  glob import or a server function) — this is project-specific I/O, stays
  app-owned like `document-minimap`'s marker source already does.
- Route wiring (`/specs/:id`), scroll-restoration, and any "edit on GitHub"
  link — app concerns, not the registry item's.

### Markdown pipeline decision

**Choice: extend the hand-rolled parser pattern already in the Tapestry
codebase (`components/markdown-text.tsx`), not a new dependency.**

That component already parses inline marks (bold/italic/code/links) and
paragraph/list blocks into React elements directly — no
`dangerouslySetInnerHTML` anywhere, so there is no HTML-sanitization surface
to begin with (the injection class DOMPurify guards against doesn't exist
when output is React elements, not an HTML string). Spec docs need two
things it doesn't yet do:
1. **Headings** (`#`/`##`/`###`) — needed for nav-tree extraction, easy to
   add as another block-level case alongside the existing bullet-list
   detection.
2. **Fenced code blocks** (`` ``` ``) — feed the fenced content straight
   into the existing `packages/ui` `CodeBlock` component (already
   dependency-free, already handles unknown languages as plain monospace).
   No new renderer needed, just routing.

Both are additive block-level cases in the same block-splitting pass
`MarkdownText` already does. This keeps the **dependency count at zero**
for the S1 use case (specs are static, repo-authored files — not
user-generated content — so CommonMark edge cases like nested blockquotes
or GFM tables are unlikely to matter in practice).

**Fallback trigger, not a default:** if a real spec doc needs tables,
nested lists, or blockquotes the hand-rolled pass can't cleanly support,
revisit with `marked` (small, dependency-light, deterministic HTML output)
+ `dompurify` for the resulting `dangerouslySetInnerHTML` — but only then,
and only as a two-package pair (a raw-HTML markdown parser without a
sanitizer is not an acceptable combination here, since spec sources may
eventually include community-contributed docs). Do not reach for a React-
component markdown renderer (e.g. `react-markdown`) — it pulls in its own
plugin ecosystem for a feature set this repo needs maybe 20% of.

### Open question for Tapestry

Do spec docs ever need embedded interactive demos (live component
previews inside prose, à la Storybook MDX)? If yes, the "just extend the
hand-rolled parser" answer changes — that's an MDX-shaped problem, not a
markdown-shaped one, and warrants its own RFC before implementation starts.

## 2. `context-flag` — dev-mode element picker

### Component/module boundary

Registry item (`packages/ui`, domain-free):
- `ContextFlag` — flat component (single-shape overlay, RULE 1 exception,
  same category as this tranche's `SpotlightScrim`). Renders a
  click-to-pick affordance; on pick, calls a caller-supplied
  `onPick(payload)` with `{ route, componentDisplayName, domPath, viewport }`.
  Resolving `componentDisplayName` from a clicked DOM node needs React
  fiber introspection (React DevTools-style `__reactFiber$` walk) — that
  logic is a pure-ish function in `lib/context-flag-resolve.ts`, isolated
  from the component exactly like `spotlight-focus.ts` isolates this
  tranche's focus math, so the fiber-walk heuristics are unit-testable
  against a constructed DOM without needing a real React tree.

App glue (Tapestry-side, NOT registry):
- The `onPick` handler itself — where the payload goes (opens a bug-report
  form, copies to clipboard, posts to an internal tool) is 100%
  app-specific and does not belong in a registry item.
- The route/viewport values in the payload — `ContextFlag` reports what it
  can read from `window`/router context if given access; the app decides
  whether to pass its own router's `location` in.

### Production-boundary guarantee

Two independent layers, because either one alone is a footgun:

1. **Bundler dead-code elimination**, the real guarantee. Gate every import
   of `ContextFlag` behind a statically-analyzable `import.meta.env.DEV`
   check — this repo already uses exactly that convention
   (`apps/web/src/routes/examples/playground.tsx:617`,
   `{import.meta.env.DEV && <SaveToSourceCard .../>}`). Vite/Vinxi replace
   `import.meta.env.DEV` with a literal `false` at production build time and
   tree-shake the dead branch, so the component's code — including the
   fiber-walk internals — is **not present** in the production bundle, not
   merely hidden behind a runtime flag.
2. **Runtime self-check**, defense in depth only (covers a caller that
   forgets the `DEV` gate at the call site, or an SSR/hydration edge case):
   the component's own module top-level does a `NODE_ENV !== "production"`
   guard and renders `null` if false. This is a backstop, not the
   mechanism — layer 1 is what actually keeps it out of the shipped JS.

Verification for the real implementation tranche: grep the production
`apps/web/.output` bundle for a distinctive string from `ContextFlag`'s
source (e.g. a unique class or the fiber-walk function name) and assert
zero matches, the same way this repo's `registry:smoke` already asserts
reclassified items are absent from `apps/web/public/r`.

### Open questions for Tapestry

- Does the fiber-walk need to survive React's production build (minified,
  no `displayName` unless components set it explicitly)? If Tapestry
  doesn't consistently set `displayName`, the picker's output degrades to
  tag names only — worth deciding now whether that's acceptable or whether
  `displayName` becomes a lint-enforced convention first.
- Where does the picked payload's `domPath` get consumed downstream — is
  there already a bug-tracker integration it should match the shape of, or
  is the shape itself still open?
