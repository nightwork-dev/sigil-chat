// Static report rendering pipeline.
// Server-renders a .tsx report to HTML, extracts CSS via a Tailwind-aware
// client build, inlines everything into a single portable HTML document.
//
// See docs/specs/template-cli-and-static-report-proposal.md §7.3.
//
// Dependency strategy: Vite + plugins + react-dom are resolved dynamically
// from the project's apps/web context at render time. The CLI package itself
// stays zero-runtime-dep — it borrows the project's installed toolchain.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import type { ReportMetadata, ReportSkill } from "./define-report";
import {
  buildHeadMeta,
  buildManifest,
  annotateAgentSections,
  detectExternalResources,
  escapeAttr,
  escapeText,
  inlineLocalImages,
  mimeForExt,
  validateReport,
} from "./assemble";

// ── Types ──────────────────────────────────────────────────────────────────

const WARN_BYTES = 5 * 1024 * 1024;
const FAIL_BYTES = 15 * 1024 * 1024;

export interface RenderOptions {
  /** Absolute path to the report .tsx file. */
  reportPath: string;
  /** Absolute path to the output HTML file. Omit when checkOnly. */
  outPath?: string;
  /** Workspace root (defaults to CWD). */
  projectRoot?: string;
  /** Validate + assemble without writing output. */
  checkOnly?: boolean;
  /** Fail (populate issues) on external resources / missing metadata / size. */
  strict?: boolean;
  /** Inline local images as data URLs. Defaults to true. */
  inline?: boolean;
  /** CLI overrides for report metadata. */
  overrides?: {
    title?: string;
    summary?: string;
    preview?: string;
    agentSummary?: string;
    skills?: ReportSkill[];
  };
  /** Canonical URL for og:url. */
  publicUrl?: string;
  /** Fetchable preview image URL for og:image. */
  previewUrl?: string;
}

export interface RenderResult {
  /** Set only when output was written to disk. */
  outPath?: string;
  /** Byte size of the full assembled document. */
  htmlBytes: number;
  cssBytes: number;
  title: string;
  /** Soft, advisory messages (size, missing images in non-strict, og hints). */
  warnings: string[];
  /** Fatal-in-strict/check findings (empty === clean). */
  issues: string[];
  externalResources: string[];
}

// ── Pipeline ───────────────────────────────────────────────────────────────

export async function renderReport(opts: RenderOptions): Promise<RenderResult> {
  const reportPath = resolve(opts.reportPath);
  const sourceRoot = resolveSourceRoot(reportPath, opts.projectRoot);
  const runtime = resolveRenderRuntime(sourceRoot);
  const projectRoot = runtime.projectRoot;
  const appsWeb = resolve(projectRoot, "apps/web");

  if (!existsSync(reportPath)) {
    throw new Error(`Report file not found: ${reportPath}`);
  }

  // Resolve the rendering toolchain from the project's apps/web context.
  const req = createRequire(runtime.requireFrom);
  // These are dynamically resolved from the project at runtime — types are
  // asserted here since the CLI package doesn't depend on vite directly.
  const vite = (await importResolved(req, "vite")) as {
    build: (config: Record<string, unknown>) => Promise<unknown>;
  };
  const reactPlugin = ((await importResolved(req, "@vitejs/plugin-react"))
    .default ??
    raise("@vitejs/plugin-react has no default export")) as () => unknown;
  const tailwindPlugin = ((await importResolved(req, "@tailwindcss/vite"))
    .default ??
    raise("@tailwindcss/vite has no default export")) as () => unknown;
  const tsPaths = ((await importResolved(req, "vite-tsconfig-paths")).default ??
    raise("vite-tsconfig-paths has no default export")) as (
    opts: Record<string, unknown>,
  ) => unknown;

  // In pnpm workspaces, react is not hoisted to the root — a report file
  // outside apps/web can't resolve react-family imports. Alias them to the
  // resolved paths from apps/web so any report location works.
  const reactAlias = resolveReactAliases(req);

  // Workspace packages resolve via tsconfig paths in dev/build, but the
  // SSR build's resolver doesn't pick them up reliably. Explicit aliases
  // (discovered from the packages directory) are more dependable.
  const workspaceAlias = resolveWorkspaceAliases(projectRoot);

  // Temp build dir INSIDE apps/web so module resolution finds node_modules.
  const tmp = join(appsWeb, ".sigil-render");
  mkdirSync(tmp, { recursive: true });

  try {
    const tsconfigProjects = [
      resolve(appsWeb, "tsconfig.json"),
      resolve(projectRoot, "packages/ui/tsconfig.json"),
    ];

    // ── SSR entry: imports report, exports render() + getMeta() ──────────
    const entryServer = join(tmp, "entry-server.tsx");
    writeFileSync(entryServer, serverEntryCode(reportPath));

    // ── Client CSS entry: @source for the report dir + globals.css ───────
    const reportDir = dirname(reportPath);
    const relSource = relative(tmp, reportDir);
    const cssEntry = join(tmp, "entry-client.css");
    // The app's themes.css carries the named envelope classes AND their `.light`
    // overrides. Pulling it in makes light mode a property of every render, not
    // something a report has to opt into. Optional: a stripped project without
    // it still renders (dark-only, base amber tokens from globals.css).
    const themesCss = resolve(appsWeb, "src/styles/themes.css");
    const themesRel = existsSync(themesCss)
      ? relative(tmp, themesCss)
      : undefined;
    writeFileSync(cssEntry, clientCssCode(relSource, themesRel));

    const entryClient = join(tmp, "entry-client.tsx");
    writeFileSync(entryClient, clientEntryCode(reportPath));

    // ── SSR build ────────────────────────────────────────────────────────
    const ssrOut = join(tmp, "ssr-out");
    await vite.build({
      configFile: false,
      root: tmp,
      logLevel: "warn",
      resolve: { alias: { ...reactAlias, ...workspaceAlias } },
      // Bundle the complete report dependency graph for SSR as well. Leaving
      // Base UI or another hook-bearing package external can load a second
      // React instance in installed-CLI consumers and trip the hook dispatcher.
      ssr: { noExternal: true },
      plugins: [reactPlugin(), tsPaths({ projects: tsconfigProjects })],
      build: {
        ssr: entryServer,
        outDir: ssrOut,
        minify: false,
        sourcemap: false,
      },
    });

    // Import the SSR output and render.
    const ssrOutput = join(ssrOut, "entry-server.js");
    const ssrMod = await import(pathToFileURL(ssrOutput).href);
    const bodyRaw: string = ssrMod.render();
    const meta: Partial<ReportMetadata> = { ...(ssrMod.getMeta?.() ?? {}) };

    // Apply CLI metadata overrides (title / summary / preview path).
    if (opts.overrides?.title) meta.title = opts.overrides.title;
    if (opts.overrides?.summary) meta.summary = opts.overrides.summary;
    if (opts.overrides?.preview) {
      meta.preview = { ...meta.preview, image: opts.overrides.preview };
    }
    if (opts.overrides?.agentSummary || opts.overrides?.skills?.length) {
      meta.agent = {
        ...meta.agent,
        summary: opts.overrides.agentSummary ?? meta.agent?.summary,
        skills: [
          ...(meta.agent?.skills ?? []),
          ...(opts.overrides.skills ?? []),
        ],
      };
    }

    // ── Client build: CSS extraction (Tailwind) + hydration bundle ───────
    // The same build emits the extracted CSS AND a single self-contained JS
    // bundle (react bundled IN, one inlinable chunk) that hydrates the report.
    const clientOut = join(tmp, "client-out");
    await vite.build({
      configFile: false,
      root: tmp,
      logLevel: "warn",
      // The report's @workspace/ui/* JS imports need explicit aliases (Rollup's
      // resolver doesn't pick up tsconfig paths for the browser build). The
      // exact "@workspace/ui/globals.css" alias in workspaceAlias is spread
      // before the generic "@workspace/ui" prefix, so the CSS @import still
      // resolves to the exported src/styles/globals.css.
      resolve: { alias: { ...reactAlias, ...workspaceAlias } },
      // react-dom references process.env.NODE_ENV; the browser has no `process`.
      // Replace it so the production react path is bundled and hydration runs
      // (without this the bundle throws `process is not defined` at load).
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: [
        reactPlugin(),
        tailwindPlugin(),
        tsPaths({ projects: tsconfigProjects }),
      ],
      build: {
        lib: { entry: entryClient, formats: ["es"] },
        outDir: clientOut,
        cssCodeSplit: false,
        minify: true,
        // One inlinable chunk, react bundled in (no external/CDN request).
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    });

    const css = findCss(clientOut);
    const clientJs = findClientJs(clientOut);

    // ── Post-render assembly (pure functions) ────────────────────────────
    const warnings: string[] = [];
    const inlineOn = opts.inline !== false;

    let body = bodyRaw;
    let missingImages: string[] = [];
    if (inlineOn) {
      const inlined = inlineLocalImages(bodyRaw, reportDir);
      body = inlined.html;
      missingImages = inlined.missing;
      for (const src of inlined.missing) {
        warnings.push(`Local image not found, left unembedded: ${src}`);
      }
    }
    body = annotateAgentSections(body, meta);

    // A local preview image (no fetchable preview-url) can't be an og:image.
    const previewDataUrl = resolvePreviewDataUrl(
      meta.preview?.image,
      reportDir,
      opts.previewUrl,
    );

    const head = buildHeadMeta(meta, {
      publicUrl: opts.publicUrl,
      previewUrl: opts.previewUrl,
      previewDataUrl,
    });
    warnings.push(...head.warnings);

    const repo = readRepoName(sourceRoot);
    const commit = readGitCommit(sourceRoot);
    const entry = relative(sourceRoot, reportPath);
    const digest = createHash("sha256")
      .update(body)
      .update(css)
      .update(clientJs)
      .update(JSON.stringify(meta))
      .update(
        JSON.stringify({
          entry,
          repo,
          commit,
        }),
      )
      .digest("hex");
    const manifest = buildManifest(meta, {
      entry,
      repo,
      createdAt: new Date().toISOString(),
      commit,
      digest: `sha256:${digest}`,
    });

    const title = meta.title ?? "Report";
    const fullHtml = assembleHtml(
      body,
      css,
      clientJs,
      title,
      meta.summary,
      head.tags,
      manifest,
    );

    const externalResources = detectExternalResources(fullHtml, css);
    const issues = validateReport(meta, {
      externalResources,
      missingImages,
      html: body,
    });

    const htmlBytes = Buffer.byteLength(fullHtml, "utf-8");
    if (htmlBytes > WARN_BYTES) {
      warnings.push(
        `Output is ${(htmlBytes / 1024 / 1024).toFixed(1)} MB (soft limit 5 MB).`,
      );
    }
    if ((opts.strict || opts.checkOnly) && htmlBytes > FAIL_BYTES) {
      issues.push(
        `Output exceeds hard limit of 15 MB (${(htmlBytes / 1024 / 1024).toFixed(1)} MB).`,
      );
    }

    const shouldWrite =
      !opts.checkOnly && opts.outPath && !(opts.strict && issues.length > 0);
    let outPath: string | undefined;
    if (shouldWrite && opts.outPath) {
      writeFileSync(opts.outPath, fullHtml);
      outPath = opts.outPath;
    }

    return {
      outPath,
      htmlBytes,
      cssBytes: css.length,
      title,
      warnings,
      issues,
      externalResources,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Whether a local preview image exists (used to gate the og:image warning). */
function resolvePreviewDataUrl(
  previewImage: string | undefined,
  reportDir: string,
  previewUrl: string | undefined,
): string | undefined {
  if (!previewImage || previewUrl) return undefined;
  if (/^(https?:)?\/\//i.test(previewImage) || previewImage.startsWith("data:"))
    return undefined;
  const abs = isAbsolute(previewImage)
    ? previewImage
    : resolve(reportDir, previewImage);
  if (!mimeForExt(extname(abs)) || !existsSync(abs)) return undefined;
  return "local"; // marker: local preview exists but is not a fetchable og:image
}

function readRepoName(projectRoot: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(projectRoot, "package.json"), "utf-8"),
    ) as {
      name?: string;
    };
    return pkg.name ?? "unknown";
  } catch {
    return basename(projectRoot);
  }
}

function resolveSourceRoot(reportPath: string, explicitRoot?: string): string {
  if (explicitRoot) return resolve(explicitRoot);
  const reportDir = dirname(reportPath);
  return findAncestorWith(reportDir, "package.json") ?? reportDir;
}

function readGitCommit(projectRoot: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

interface RenderRuntime {
  projectRoot: string;
  requireFrom: string;
}

function resolveRenderRuntime(requestedRoot: string): RenderRuntime {
  const requestedWeb = resolve(requestedRoot, "apps/web/package.json");
  if (existsSync(requestedWeb)) {
    return { projectRoot: requestedRoot, requireFrom: requestedWeb };
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const checkout = findAncestorWith(moduleDir, "apps/web/package.json");
  if (checkout) {
    return {
      projectRoot: checkout,
      requireFrom: resolve(checkout, "apps/web/package.json"),
    };
  }

  const packageRoot = findAncestorWith(moduleDir, "package.json");
  const bundledRoot = packageRoot
    ? resolve(packageRoot, "template")
    : undefined;
  if (
    packageRoot &&
    bundledRoot &&
    existsSync(resolve(bundledRoot, "apps/web/package.json"))
  ) {
    return {
      projectRoot: bundledRoot,
      requireFrom: resolve(packageRoot, "package.json"),
    };
  }

  throw new Error(
    "Unable to locate the Sigil render toolchain. Reinstall the CLI or pass --cwd to a Sigil workspace.",
  );
}

function findAncestorWith(
  start: string,
  relativePath: string,
): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(resolve(dir, relativePath))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function importResolved(
  req: NodeRequire,
  mod: string,
): Promise<Record<string, unknown>> {
  const resolved = req.resolve(mod);
  return import(pathToFileURL(resolved).href) as Promise<
    Record<string, unknown>
  >;
}

function resolveReactAliases(req: NodeRequire): Record<string, string> {
  return {
    "react-dom/server": req.resolve("react-dom/server"),
    "react-dom/client": req.resolve("react-dom/client"),
    "react-dom": req.resolve("react-dom"),
    "react/jsx-runtime": req.resolve("react/jsx-runtime"),
    "react/jsx-dev-runtime": req.resolve("react/jsx-dev-runtime"),
    react: req.resolve("react"),
  };
}

function resolveWorkspaceAliases(projectRoot: string): Record<string, string> {
  const packagesDir = resolve(projectRoot, "packages");
  if (!existsSync(packagesDir)) return {};

  // Vite matches aliases in insertion order (first match wins), and a bare
  // `@workspace/cli` prefix would swallow `@workspace/cli/report`. So collect
  // exact subpath-export aliases FIRST, then the generic per-package prefixes.
  const exact: Record<string, string> = {};
  const prefix: Record<string, string> = {};

  for (const entry of readdirSync(packagesDir)) {
    const pkgDir = resolve(packagesDir, entry);
    const srcDir = resolve(pkgDir, "src");
    if (!existsSync(srcDir)) continue;
    prefix[`@workspace/${entry}`] = srcDir;

    // Honor non-glob string exports (e.g. cli's "./report") so a report can
    // import the package's public entry, not just files that happen to mirror
    // the src/ layout. Wildcard and non-JS/TS targets are left to the prefix.
    const pkgJson = resolve(pkgDir, "package.json");
    if (!existsSync(pkgJson)) continue;
    try {
      const exportsMap = (
        JSON.parse(readFileSync(pkgJson, "utf-8")) as {
          exports?: Record<string, unknown>;
        }
      ).exports;
      if (!exportsMap) continue;
      for (const [key, target] of Object.entries(exportsMap)) {
        if (typeof target !== "string") continue;
        if (key.includes("*") || key === ".") continue;
        // Include .css exports (e.g. "./globals.css") so the exact alias wins
        // over the generic "@workspace/ui" prefix — otherwise "@workspace/ui/
        // globals.css" would resolve to src/globals.css instead of the exported
        // src/styles/globals.css.
        if (!/\.(tsx?|jsx?|css)$/.test(target)) continue;
        const subpath = key.replace(/^\.\//, "");
        exact[`@workspace/${entry}/${subpath}`] = resolve(pkgDir, target);
      }
    } catch {
      // Malformed package.json — fall back to the prefix alias only.
    }
  }

  const reportHelper = resolve(packagesDir, "cli/src/report/define-report.ts");
  if (existsSync(reportHelper)) {
    exact["@workspace/cli/report"] = reportHelper;
    exact["sigil/report"] = reportHelper;
  }

  return { ...exact, ...prefix };
}

function raise(msg: string): never {
  throw new Error(msg);
}

function serverEntryCode(reportPath: string): string {
  return [
    `import { renderToString } from "react-dom/server"`,
    `import Report, * as Mod from ${JSON.stringify(reportPath)}`,
    ``,
    `export function render() {`,
    `  // renderToString (not renderToStaticMarkup) so the SSR markup carries`,
    `  // the hydration hints the client bundle needs to attach without a rebuild.`,
    `  return renderToString(<Report />)`,
    `}`,
    ``,
    `export function getMeta() {`,
    `  // Return the ENTIRE report metadata object so downstream assembly sees`,
    `  // title, summary, author, tags, preview, and agent nav.`,
    `  const m = (Mod as { report?: Record<string, unknown> }).report || {}`,
    `  return { ...m }`,
    `}`,
    ``,
  ].join("\n");
}

function clientEntryCode(reportPath: string): string {
  // Real hydration entry: pulls in the extracted CSS (so Tailwind still scans
  // the same build) AND hydrates the SSR'd report into #sigil-root. Built with
  // the react plugin (already wired), so JSX + react are bundled in.
  return [
    `import "./entry-client.css"`,
    `import { hydrateRoot } from "react-dom/client"`,
    `import Report from ${JSON.stringify(reportPath)}`,
    ``,
    `const el = document.getElementById("sigil-root")`,
    `if (el) hydrateRoot(el, <Report />)`,
    ``,
  ].join("\n");
}

function clientCssCode(
  reportRelSource: string,
  themesRelSource?: string,
): string {
  const lines = [
    `/* Scan the report directory for Tailwind class names. */`,
    `@source "${reportRelSource}/**/*.{ts,tsx}";`,
    `/* Import the full design system (tokens + theme classes + component styles). */`,
    `@import "@workspace/ui/globals.css";`,
  ];
  if (themesRelSource) {
    // Named envelope classes + their `.light` overrides. Imported AFTER globals
    // so the light-mode token overrides win in a `<html class="theme-x light">`.
    lines.push(`/* App theme envelopes + light-mode overrides. */`);
    lines.push(`@import "${themesRelSource.split("\\").join("/")}";`);
  }
  lines.push(``);
  return lines.join("\n");
}

function findCss(dir: string): string {
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".css")) {
      return readFileSync(join(dir, file), "utf-8");
    }
  }
  const assets = join(dir, "assets");
  if (existsSync(assets)) {
    for (const file of readdirSync(assets)) {
      if (file.endsWith(".css")) {
        return readFileSync(join(assets, file), "utf-8");
      }
    }
  }
  return "";
}

/** The single JS chunk emitted by the client build (react bundled in). */
function findClientJs(dir: string): string {
  const isJs = (f: string) => f.endsWith(".js") || f.endsWith(".mjs");
  for (const file of readdirSync(dir)) {
    if (isJs(file)) return readFileSync(join(dir, file), "utf-8");
  }
  const assets = join(dir, "assets");
  if (existsSync(assets)) {
    for (const file of readdirSync(assets)) {
      if (isJs(file)) return readFileSync(join(assets, file), "utf-8");
    }
  }
  return "";
}

/**
 * Neutralize any literal `</script>` inside a JS payload so it can't terminate
 * the inline `<script>` element early. `<\/script>` is equivalent JS.
 */
function escapeScriptClose(js: string): string {
  return js.replace(/<\/(script)/gi, "<\\/$1");
}

// Pre-paint mode resolver. Runs synchronously in <head> before styles paint,
// so there's no dark→light flash. Reads a saved override, else the OS
// `prefers-color-scheme`. Mirrors the app's class contract: exactly one of
// `.light` / `.dark` on <html>, the envelope class (`.theme-*`) untouched.
const NO_FLASH_SCRIPT = [
  `<script>`,
  `(function(){try{`,
  `var m=localStorage.getItem("sigil-report-mode");`,
  `var light=m==="light"||(m!=="dark"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches);`,
  `var e=document.documentElement;`,
  `if(light){e.classList.add("light");e.classList.remove("dark");}`,
  `else{e.classList.add("dark");e.classList.remove("light");}`,
  `}catch(_){}})();`,
  `</script>`,
].join("");

// A fixed light/dark toggle. It lives OUTSIDE #sigil-root so React never
// reconciles it (an inline script inside the report would be clobbered on
// hydration). Styled with design tokens directly — injected chrome can't use
// Tailwind utilities (Tailwind only emits classes it finds in scanned files).
// The icon swap keys off the `.light`/`.dark` marker via a scoped style rule.
const MODE_TOGGLE = [
  `<style>`,
  `#sigil-mode-toggle{position:fixed;bottom:1rem;right:1rem;z-index:50;display:inline-flex;`,
  `align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:9999px;`,
  `border:1px solid var(--border);background:var(--card);color:var(--foreground);cursor:pointer;`,
  `box-shadow:0 1px 4px rgba(0,0,0,.25);transition:background .15s,color .15s;padding:0}`,
  `#sigil-mode-toggle:hover{background:var(--muted)}`,
  `#sigil-mode-toggle svg{width:1.05rem;height:1.05rem}`,
  `.dark #sigil-mode-toggle .sigil-moon{display:none}`,
  `.light #sigil-mode-toggle .sigil-sun{display:none}`,
  `@media print{#sigil-mode-toggle{display:none}}`,
  `</style>`,
  `<button id="sigil-mode-toggle" type="button" aria-label="Toggle light and dark mode" title="Toggle light / dark">`,
  // Sun (shown in dark mode → click for light)
  `<svg class="sigil-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  // Moon (shown in light mode → click for dark)
  `<svg class="sigil-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  `</button>`,
  `<script>`,
  `(function(){var b=document.getElementById("sigil-mode-toggle");if(!b)return;`,
  `b.addEventListener("click",function(){var e=document.documentElement;`,
  `var toLight=!e.classList.contains("light");`,
  `if(toLight){e.classList.add("light");e.classList.remove("dark");}`,
  `else{e.classList.add("dark");e.classList.remove("light");}`,
  `try{localStorage.setItem("sigil-report-mode",toLight?"light":"dark");}catch(_){}});})();`,
  `</script>`,
].join("");

function assembleHtml(
  html: string,
  css: string,
  clientJs: string,
  title: string,
  summary: string | undefined,
  headExtra: string,
  manifest: string,
): string {
  const desc = summary
    ? `\n  <meta name="description" content="${escapeAttr(summary)}">`
    : "";
  const og = headExtra ? `\n${headExtra}` : "";
  // The report is SSR'd into #sigil-root so the client bundle can hydrate it in
  // place (hydrateRoot attaches to the children; the wrapper itself isn't
  // hydrated). The markup is complete on its own — if the <script> is stripped
  // (email), the report still shows; the inline module only enhances.
  const script = clientJs
    ? [
        `  <script type="module">`,
        escapeScriptClose(clientJs),
        `  </script>`,
      ].join("\n")
    : "";
  return [
    `<!DOCTYPE html>`,
    // SSR defaults to dark amber; NO_FLASH_SCRIPT corrects the mode pre-paint.
    `<html lang="en" class="dark theme-amber">`,
    `<head>`,
    `  <meta charset="UTF-8">`,
    `  <meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `  ${NO_FLASH_SCRIPT}`,
    `  <title>${escapeText(title)}</title>${desc}${og}`,
    manifest,
    `  <style>`,
    css,
    `  </style>`,
    `</head>`,
    `<body>`,
    // No whitespace between the wrapper and the SSR markup: stray text nodes
    // inside #sigil-root would not match the client's <Report /> render and
    // would trigger a hydration mismatch (React #418).
    `<div id="sigil-root">${html}</div>`,
    // Chrome + scripts live OUTSIDE #sigil-root so React hydration never touches
    // them.
    MODE_TOGGLE,
    script,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}
