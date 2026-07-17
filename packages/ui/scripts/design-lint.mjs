#!/usr/bin/env node
// Design-language gate. Zero-dependency ESM; uses only node:fs and node:path.
// Scans .ts/.tsx source for raw-palette, non-responsive grid, arbitrary px
// spacing, and (packages/ui/src/components only) hand-rolled touch-drag
// surfaces missing a touch-action opt-out. Prints `path:line rule-id message`
// per violation and exits non-zero if any are found. See AGENTS.md /
// ux-design-language skill.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

// Resolve everything against the repo root (derived from this script's own
// location: <root>/packages/ui/scripts/design-lint.mjs), NOT process.cwd() —
// so `pnpm --filter @workspace/ui lint:design` (cwd = packages/ui) scans the
// real tree instead of silently walking zero nonexistent paths.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const ROOT = REPO_ROOT
const DEFAULT_DIRS = [
  "apps/web/src",
  "packages/ui/src",
  "packages/chat/src",
  "packages/data/src",
  "packages/canvas/src",
].map((d) => join(REPO_ROOT, d))

// Paths that match any of these substrings are skipped entirely (allowlist).
const ALLOWLIST = [
  "/lib/colors",
  "/lib/tone", // the semantic-tone → palette mapping; raw palette classes live here by design
  "/bench/", // temporary adversarial-benchmark evidence (verbatim model output; deleted before merge)
  "/components/tabs.tsx", // stock shadcn primitive; its p-[3px] tab-list inset is upstream, kept stock
  ".test.",
  "/registry-staging/",
  "/node_modules/",
  "/dist/",
  "/.output/",
]

const RAW_PALETTE =
  /(bg|text|border|ring|fill|stroke)-(red|green|blue|yellow|emerald|amber|sky|rose|orange|lime|teal|cyan|violet|purple|pink|fuchsia|slate|zinc|neutral|stone)-[0-9]+/
// A grid is "responsive-aware" if a breakpoint changes the column count OR
// switches the display mode (e.g. `grid-cols-2 ... sm:flex-row`), or if the
// columns are set conditionally via a group-data variant (shadcn pattern).
const RESPONSIVE_GRID =
  /(sm|md|lg|xl|2xl):(grid-cols|flex|block|hidden|grid\b)|group-data-\[[^\]]*\][^\s"']*:grid-cols/
// Only 3+ columns risk mobile overflow (3 cols at 320px ≈ 106px each). A fixed
// grid-cols-2 is idiomatic for this dense design system ("Dense, not spacious")
// and stays legible on narrow viewports, so it's exempt.
const GRID_COLS = /grid-cols-([3-9]|[1-9][0-9])/
// Lookbehind guards against matching the token mid-word: without it, `top-[2px]`
// matches the `p` token and `bottom-[3px]` matches `m` — false positives on
// position utilities (top/bottom/left/right), not spacing.
const PX_SPACING =
  /(?<![a-zA-Z-])(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-\[[0-9]+px\]/

// touch-drag is file-scoped (not per-line like the rules above): a hand-rolled
// pointer-drag surface must prevent the browser from treating the same
// gesture as a page scroll on touch devices. Only applies under
// packages/ui/src/components, where custom drag surfaces live.
//
// Limits (best-effort heuristic, documented rather than hidden):
// - Only checks that SOME touch-action opt-out exists anywhere in the file,
//   not that it's on the same element as the pointer handlers — a file with
//   an unrelated touch-none div elsewhere would false-pass.
// - Only fires on onPointerDown + onPointerMove together (the drag shape); a
//   component that only listens for onPointerDown (tap, not drag) won't be
//   flagged, which is correct — taps don't need this.
// - Doesn't see onMouseDown-only drag surfaces (they don't receive touch
//   events at all in most browsers, so this rule doesn't apply to them).
const POINTER_DOWN = /onPointerDown\s*=/
const POINTER_MOVE = /onPointerMove\s*=/
const TOUCH_ACTION_OPT_OUT =
  /touchAction\s*:\s*["'](none|pan-x|pan-y)["']|\btouch-none\b|\btouch-pan-(x|y)\b/

function checkFileScoped(path, content) {
  const norm = path.split(sep).join("/")
  if (!norm.includes("packages/ui/src/components/")) return null
  if (!POINTER_DOWN.test(content) || !POINTER_MOVE.test(content)) return null
  if (TOUCH_ACTION_OPT_OUT.test(content)) return null
  return [
    "touch-drag",
    "has onPointerDown/onPointerMove drag handlers but no touchAction/touch-none opt-out anywhere in the file — mobile drags will scroll the page instead of dragging",
  ]
}

// Inline suppression: `design-lint-ignore` on the offending line or the line
// directly above skips all rules there; `design-lint-ignore <rule-id> ...`
// skips only the named rule(s). Lets an author justify an intentional exception
// in place (with a reason in the same comment) instead of broadening the file
// allowlist. E.g. `{/* design-lint-ignore bare-grid — 7-col calendar */}`.
function ignoreDirective(line) {
  const m = line.match(/design-lint-ignore(?:\s+([a-z][a-z-]*(?:\s+[a-z][a-z-]*)*))?/)
  if (!m) return null
  return { all: !m[1], rules: m[1] ? m[1].split(/\s+/) : [] }
}
function isIgnored(rule, thisLine, prevLine) {
  for (const d of [ignoreDirective(thisLine), ignoreDirective(prevLine)]) {
    if (d && (d.all || d.rules.includes(rule))) return true
  }
  return false
}

function isAllowed(p) {
  // Normalize separators so the substrings match on any platform.
  const norm = p.split(sep).join("/")
  return ALLOWLIST.some((frag) => norm.includes(frag))
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      // Check the allowlist on directories too — never recurse into
      // node_modules/dist trees (an arbitrary path arg can contain them).
      if (!isAllowed(`${p}/`)) walk(p, out)
    } else if (st.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx"))) {
      if (!isAllowed(p)) out.push(p)
    }
  }
  return out
}

function checkLine(line) {
  const hits = []
  if (RAW_PALETTE.test(line)) {
    hits.push([
      "raw-palette",
      "raw palette class — semantic status uses lib/tone; categorical data uses chart-* tokens",
    ])
  }
  if (GRID_COLS.test(line) && !RESPONSIVE_GRID.test(line)) {
    hits.push([
      "bare-grid",
      "non-responsive grid — add grid-cols-1 base + responsive variants",
    ])
  }
  if (PX_SPACING.test(line)) {
    hits.push([
      "arbitrary-px-spacing",
      "arbitrary px spacing — use the spacing scale",
    ])
  }
  return hits
}

// Explicit targets resolve against cwd (so `... packages/ui/src` from the repo
// root still works); no targets → the repo-root-anchored DEFAULT_DIRS.
const targets = process.argv.slice(2).map((t) => resolve(t))
const roots = targets.length ? targets : DEFAULT_DIRS

let files
if (roots.length === 1) {
  let st
  try {
    st = statSync(roots[0])
  } catch {
    console.error(`error: cannot stat ${roots[0]}`)
    process.exit(2)
  }
  files = st.isDirectory() ? walk(roots[0]) : st.isFile() ? [roots[0]] : []
} else {
  files = roots.flatMap((r) => {
    try {
      return statSync(r).isDirectory() ? walk(r) : []
    } catch {
      return []
    }
  })
}

const violations = []
for (const file of files) {
  const content = readFileSync(file, "utf8")
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const prev = i > 0 ? lines[i - 1] : ""
    for (const [rule, message] of checkLine(lines[i])) {
      if (isIgnored(rule, lines[i], prev)) continue
      violations.push(`${relative(ROOT, file) || file}:${i + 1} ${rule} ${message}`)
    }
  }
  const fileScoped = checkFileScoped(file, content)
  if (fileScoped && !lines.some((l) => isIgnored("touch-drag", l, ""))) {
    const [rule, message] = fileScoped
    violations.push(`${relative(ROOT, file) || file}:1 ${rule} ${message}`)
  }
}

for (const v of violations) console.log(v)
console.log(`${violations.length} violations found`)
process.exit(violations.length > 0 ? 1 : 0)
