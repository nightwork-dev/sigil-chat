/**
 * Pure string-insertion helpers for the dev-only "Save to source" writer.
 *
 * These take existing file TEXT + a theme name + generated content and return
 * NEW file text. No I/O — that lives in the server function that calls these.
 * Keeping them pure is what makes the writer unit-testable (insert once, then
 * re-insert idempotently → identical output).
 *
 * Three surfaces are edited when a theme is saved:
 *   1. themes.css   — a `.theme-<name>` block (dark) + `.theme-<name>.light`.
 *   2. theme.tsx    — a `{ className, label, … }` entry in the THEMES array.
 *   3. theme-derive — a params entry in the PRESETS record.
 */

// Names that would collide with routing/reserved words or the marker classes.
const RESERVED = new Set(["light", "dark", "system", "theme", "no-transition"])

export interface ThemeNameCheck {
  ok: boolean
  reason?: string
}

/** Validate a theme name: kebab-case, not reserved. */
export function validateThemeName(name: string): ThemeNameCheck {
  if (!name) return { ok: false, reason: "Name is required" }
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    return { ok: false, reason: "Name must be kebab-case (a-z, 0-9, hyphens; must start with a letter)" }
  }
  if (RESERVED.has(name)) return { ok: false, reason: `"${name}" is a reserved name` }
  return { ok: true }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** A single flat CSS block: `<selector> { … }` (no nested braces in ours). */
function blockRegex(selector: string): RegExp {
  return new RegExp(`${escapeRe(selector)}\\s*\\{[^}]*\\}`)
}

/** True if a `.theme-<name>` block already exists in the stylesheet. */
export function themeCssExists(css: string, name: string): boolean {
  return blockRegex(`.theme-${name}`).test(css)
}

// The light-section banner begins with this box-drawing run (see themes.css).
// Dark blocks are inserted just before it; light blocks are appended at EOF so
// each stays in its own region, matching the hand-authored file shape.
const LIGHT_BANNER = "/* ═"

/**
 * Insert or update a theme's dark + light blocks in themes.css.
 * Idempotent: calling twice with the same name replaces in place rather than
 * appending duplicates.
 */
export function upsertThemeCss(
  css: string,
  name: string,
  darkBlock: string,
  lightBlock: string,
): string {
  const darkSel = `.theme-${name}`
  const lightSel = `.theme-${name}.light`
  let out = css

  // ── Dark block ──
  const darkRe = blockRegex(darkSel)
  if (darkRe.test(out)) {
    out = out.replace(darkRe, darkBlock)
  } else {
    const bannerAt = out.indexOf(LIGHT_BANNER)
    if (bannerAt >= 0) {
      out = out.slice(0, bannerAt) + darkBlock + "\n\n" + out.slice(bannerAt)
    } else {
      out = out.trimEnd() + "\n\n" + darkBlock + "\n"
    }
  }

  // ── Light block ──
  const lightRe = blockRegex(lightSel)
  if (lightRe.test(out)) {
    out = out.replace(lightRe, lightBlock)
  } else {
    out = out.trimEnd() + "\n\n" + lightBlock + "\n"
  }

  return out
}

/**
 * Insert or update a THEMES entry in theme.tsx.
 * Anchors on the `] as const` that closes the THEMES array. Idempotent by
 * `className`.
 */
export interface ThemeRegistration {
  className: string
  label: string
  description: string
  signal: string
  void: string
  paper: string
}

function themesEntry(r: ThemeRegistration): string {
  return `  {
    className: "${r.className}",
    label: "${r.label}",
    description: "${r.description}",
    signal: "${r.signal}",
    void: "${r.void}",
    paper: "${r.paper}",
  },`
}

export function upsertThemeRegistration(source: string, r: ThemeRegistration): string {
  // Replace an existing entry object that carries this className.
  const existing = new RegExp(
    `\\n  \\{\\n    className: "${escapeRe(r.className)}",[\\s\\S]*?\\n  \\},`,
  )
  if (existing.test(source)) {
    return source.replace(existing, "\n" + themesEntry(r))
  }
  // Insert before the array close `] as const`.
  const closeRe = /\n\] as const/
  if (!closeRe.test(source)) {
    throw new Error("Could not find THEMES array close (`] as const`) in theme.tsx")
  }
  return source.replace(closeRe, "\n" + themesEntry(r) + "\n] as const")
}

/**
 * Insert or update a PRESETS entry in theme-derive.ts.
 * `params` is serialized as a compact one-line object. Idempotent by key.
 */
export function upsertPreset(
  source: string,
  name: string,
  paramsLiteral: string,
): string {
  const key = /^[a-z][a-z0-9]*$/.test(name) ? name : `"${name}"`
  const line = `  ${key}: ${paramsLiteral},`
  // Match an existing `  <key>: { … },` line for this name.
  const keyRe = /^[a-z][a-z0-9]*$/.test(name) ? name : `"${escapeRe(name)}"`
  const existing = new RegExp(`\\n  ${keyRe}:\\s*\\{[^}]*\\},`)
  if (existing.test(source)) {
    return source.replace(existing, "\n" + line)
  }
  // Insert before the record close `\n}` of `export const PRESETS ... = {`.
  const anchor = /(export const PRESETS[\s\S]*?)(\n\})/
  const m = source.match(anchor)
  if (!m) throw new Error("Could not find PRESETS record in theme-derive.ts")
  return source.replace(anchor, `$1\n${line}$2`)
}

/** Serialize VariantParams to a compact object literal for the PRESETS entry. */
export function paramsLiteral(params: Record<string, number>): string {
  const parts = Object.entries(params).map(([k, v]) => `${k}: ${v}`)
  return `{ ${parts.join(", ")} }`
}
