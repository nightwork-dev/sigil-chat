// Pure, side-effect-light post-render assembly for the static report pipeline.
//
// These functions carry ALL the post-SSR logic (image inlining, Open Graph
// head metadata, the JSON manifest, external-resource detection, metadata
// validation) so they can be unit-tested WITHOUT running the heavy Vite build.
// `renderReport()` in ./render.ts orchestrates them.
//
// See docs/specs/template-cli-and-static-report-proposal.md §7.5, §8.3, §9.1.

import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import type { ReportMetadata } from "./define-report";

// ── mime ─────────────────────────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

/** Mime type for a supported image extension, or undefined if unsupported. */
export function mimeForExt(ext: string): string | undefined {
  return MIME_BY_EXT[ext.toLowerCase()];
}

/** True for srcs that must never be inlined (external or already a data URL). */
function isExternalSrc(src: string): boolean {
  return /^(https?:)?\/\//i.test(src) || src.startsWith("data:");
}

// ── image inlining ─────────────────────────────────────────────────────────

export interface InlineResult {
  html: string;
  /** Original srcs that were embedded as data URLs. */
  embedded: string[];
  /** Original srcs that are local but could not be embedded. */
  missing: string[];
}

/**
 * Rewrite every `<img>` whose `src` is a LOCAL path into a base64 `data:` URL.
 * External (`http(s)://`, `//host`) and existing `data:` srcs are left as-is.
 * Relative srcs resolve against `reportDir`. Missing/unreadable/unknown-type
 * local images are recorded in `missing` and left untouched (the caller decides
 * whether that is fatal in strict mode).
 */
export function inlineLocalImages(
  html: string,
  reportDir: string,
): InlineResult {
  const embedded: string[] = [];
  const missing: string[] = [];

  const out = html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(
      /(\ssrc\s*=\s*)(["'])(.*?)\2/i,
      (whole, pre: string, quote: string, src: string) => {
        if (isExternalSrc(src)) return whole;

        const clean = src.replace(/[?#].*$/, "");
        const abs = isAbsolute(clean) ? clean : resolve(reportDir, clean);
        const mime = mimeForExt(extname(abs));

        if (!mime || !existsSync(abs)) {
          missing.push(src);
          return whole;
        }

        try {
          const bytes = readFileSync(abs);
          embedded.push(src);
          return `${pre}${quote}data:${mime};base64,${bytes.toString("base64")}${quote}`;
        } catch {
          missing.push(src);
          return whole;
        }
      },
    ),
  );

  return { html: out, embedded, missing };
}

// ── open graph / head metadata ───────────────────────────────────────────────

export interface HeadMetaOptions {
  publicUrl?: string;
  previewUrl?: string;
  /** Present when a LOCAL preview image exists but no fetchable previewUrl. */
  previewDataUrl?: string;
}

export interface HeadMetaResult {
  /** Ready-to-splice `<meta property="og:…">` lines (may be empty). */
  tags: string;
  warnings: string[];
}

/**
 * Build Open Graph + Twitter card `<meta>` tags for the fields that exist.
 * A local-only preview (no `--preview-url`) never becomes `og:image` — Slack's
 * unfurl crawler needs a fetchable URL — instead it is omitted with a warning.
 */
export function buildHeadMeta(
  meta: Partial<ReportMetadata>,
  opts: HeadMetaOptions = {},
): HeadMetaResult {
  const lines: string[] = [];
  const warnings: string[] = [];
  const push = (property: string, content: string, attr = "property") =>
    lines.push(
      `  <meta ${attr}="${property}" content="${escapeAttr(content)}">`,
    );

  if (meta.title) {
    push("og:title", meta.title);
    push("og:type", "article");
  }
  if (meta.summary) push("og:description", meta.summary);
  if (opts.publicUrl) push("og:url", opts.publicUrl);

  if (opts.previewUrl) {
    push("og:image", opts.previewUrl);
    if (meta.preview?.alt) push("og:image:alt", meta.preview.alt);
    push("twitter:card", "summary_large_image", "name");
  } else if (opts.previewDataUrl) {
    warnings.push(
      "Local preview image present but no --preview-url: omitting og:image. " +
        "Slack/Open Graph crawlers need a fetchable URL, not a data URL.",
    );
  }

  return { tags: lines.join("\n"), warnings };
}

// ── manifest ─────────────────────────────────────────────────────────────────

export interface ManifestOptions {
  entry: string;
  repo: string;
  createdAt: string;
  commit?: string;
  digest?: string;
}

/**
 * Build the `<script type="application/json" id="sigil-report-manifest">` block.
 * `<` is escaped as `<` so an embedded `</script>` can't break out of the
 * script element while the payload stays valid JSON.
 */
export function buildManifest(
  meta: Partial<ReportMetadata>,
  opts: ManifestOptions,
): string {
  const manifest = {
    schemaVersion: "1.0",
    title: meta.title,
    summary: meta.agent?.summary ?? meta.summary,
    createdAt: opts.createdAt,
    author: meta.author,
    tags: meta.tags,
    source: {
      entry: opts.entry,
      repo: opts.repo,
      commit: opts.commit,
      digest: opts.digest,
    },
    navigation: (meta.agent?.nav ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      selector: `#${n.id}`,
      summary: n.summary,
    })),
    skills: meta.agent?.skills ?? [],
  };

  const json = JSON.stringify(manifest, null, 2).replace(/</g, "\\u003c");
  return [
    `  <script type="application/json" id="sigil-report-manifest">`,
    json,
    `  </script>`,
  ].join("\n");
}

// ── external resource detection ──────────────────────────────────────────────

/**
 * Collect every `http(s)://` resource referenced by an assembled document —
 * `src=`/`href=` attributes in the HTML and `url(…)` values in the CSS.
 * Used by strict mode and `report check` to reject non-self-contained output.
 */
export function detectExternalResources(html: string, css: string): string[] {
  const found = new Set<string>();

  const attrRe = /\s(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  for (const m of html.matchAll(attrRe)) found.add(m[1]);

  const cssRe = /url\(\s*["']?(https?:\/\/[^)"']+)["']?\s*\)/gi;
  for (const m of css.matchAll(cssRe)) found.add(m[1]);

  return [...found];
}

// ── validation ───────────────────────────────────────────────────────────────

export interface ValidateContext {
  externalResources: string[];
  missingImages: string[];
  /** Rendered report body, used to validate agent navigation. */
  html?: string;
}

/**
 * Report metadata + resource issues (empty array === valid). Callers decide
 * severity: strict render and `report check` treat any issue as fatal; a normal
 * render treats them as advisory.
 */
export function validateReport(
  meta: Partial<ReportMetadata>,
  ctx: ValidateContext,
): string[] {
  const issues: string[] = [];

  if (!meta.title) issues.push("Missing required metadata: title");
  if (!meta.summary) issues.push("Missing required metadata: summary");
  if (meta.preview?.image && !meta.preview.alt) {
    issues.push("Preview image is set but preview.alt is missing");
  }
  for (const src of ctx.missingImages) {
    issues.push(`Local image could not be embedded: ${src}`);
  }
  for (const url of ctx.externalResources) {
    issues.push(`External resource referenced: ${url}`);
  }

  const nav = meta.agent?.nav ?? [];
  const navIds = new Set<string>();
  for (const entry of nav) {
    if (navIds.has(entry.id))
      issues.push(`Duplicate agent navigation id: ${entry.id}`);
    navIds.add(entry.id);
    if (!entry.id.trim()) issues.push("Agent navigation id must not be empty");
    if (!entry.title.trim())
      issues.push(`Agent navigation title is missing for id: ${entry.id}`);
  }

  if (ctx.html !== undefined) {
    const documentIds = collectHtmlIds(ctx.html);
    const duplicateDocumentIds = duplicateValues(documentIds);
    for (const id of duplicateDocumentIds)
      issues.push(`Duplicate rendered HTML id: ${id}`);
    const idSet = new Set(documentIds);
    for (const entry of nav) {
      if (entry.id && !idSet.has(entry.id)) {
        issues.push(
          `Agent navigation target not found in rendered HTML: #${entry.id}`,
        );
      }
    }
  }

  const skillNames = new Set<string>();
  for (const skill of meta.agent?.skills ?? []) {
    if (!skill.name.trim())
      issues.push("Embedded skill name must not be empty");
    if (skillNames.has(skill.name))
      issues.push(`Duplicate embedded skill name: ${skill.name}`);
    skillNames.add(skill.name);
    if (!skill.description.trim())
      issues.push(`Embedded skill description is missing: ${skill.name}`);
    if (!skill.content.trim())
      issues.push(`Embedded skill content is missing: ${skill.name}`);
    if (!skill.scope.trim())
      issues.push(`Embedded skill scope is missing: ${skill.name}`);
    if (skill.trust !== "advisory") {
      issues.push(`Embedded skill must be marked advisory: ${skill.name}`);
    }
  }

  return issues;
}

/**
 * Add concise, non-authoritative section hints immediately before nav targets.
 *
 * The comment is spliced DIRECTLY against the opening tag with no whitespace
 * between them. This is load-bearing: the report body is hydrated on the client,
 * and React's hydration skips comment nodes but NOT whitespace text nodes — a
 * `\n` between the comment and the tag would materialize as a stray text node
 * the client's JSX tree doesn't have, throwing a hydration mismatch (React #418)
 * once per annotated section. `<!-- … --><tag>` hydrates clean; `<!-- … -->\n<tag>`
 * does not. The `annotate splices the comment flush against the tag` test guards this.
 */
export function annotateAgentSections(
  html: string,
  meta: Partial<ReportMetadata>,
): string {
  let out = html;
  for (const entry of meta.agent?.nav ?? []) {
    if (!entry.id || !hasHtmlId(out, entry.id)) continue;
    const comment = `<!-- sigil:section id="${escapeComment(entry.id)}" title="${escapeComment(entry.title)}"${entry.summary ? ` summary="${escapeComment(entry.summary)}"` : ""} -->`;
    const tag = findOpeningTagWithId(out, entry.id);
    if (tag) out = out.replace(tag, `${comment}${tag}`);
  }
  return out;
}

function collectHtmlIds(html: string): string[] {
  const markup = html.replace(/<!--[\s\S]*?-->/g, "");
  return [...markup.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function hasHtmlId(html: string, id: string): boolean {
  return collectHtmlIds(html).includes(id);
}

function findOpeningTagWithId(html: string, id: string): string | undefined {
  const escaped = escapeRegExp(id);
  return html.match(
    new RegExp(`<[a-z][^>]*\\sid\\s*=\\s*["']${escaped}["'][^>]*>`, "i"),
  )?.[0];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeComment(value: string): string {
  return escapeAttr(value).replace(/--/g, "&#45;&#45;");
}

// ── escaping (shared with render.ts) ─────────────────────────────────────────

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
