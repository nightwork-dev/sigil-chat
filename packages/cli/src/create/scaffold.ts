// Scaffold engine: read the template manifest, copy with excludes, apply
// identity rewrites. The manifest is the single source of truth — the CLI
// carries no hardcoded path lore. See docs/specs/template-cli-and-static-report-proposal.md §6.3.

import {
  cpSync,
  existsSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RewriteRule {
  /** Path relative to template/project root. */
  file: string;
  /** JSON path into the file, e.g. "$.name" or "$.scripts.dev". */
  jsonPath?: string;
  /** Set the value at jsonPath to this (after var substitution). */
  value?: string;
  /** Within the string at jsonPath, replace [0] with [1] (after var subst). */
  replace?: [string, string];
}

export interface TemplateManifest {
  name: string;
  displayName?: string;
  defaultPackageManager?: string;
  exclude: string[];
  rewrite?: RewriteRule[];
  postCreate?: string[];
}

export interface ScaffoldOptions {
  templateRoot: string;
  targetDir: string;
  packageName: string;
  devHost: string;
  dryRun: boolean;
  force?: boolean;
}

export interface ScaffoldResult {
  fileCount: number;
  rewriteCount: number;
  plannedRewrites: RewriteRule[];
}

// ── Manifest ───────────────────────────────────────────────────────────────

export function readManifest(templateRoot: string): TemplateManifest {
  const manifestPath = join(templateRoot, "template.sigil.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`template.sigil.json not found at ${manifestPath}`);
  }
  const value = JSON.parse(readFileSync(manifestPath, "utf-8")) as unknown;
  assertTemplateManifest(value);
  return value;
}

function assertTemplateManifest(
  value: unknown,
): asserts value is TemplateManifest {
  if (!value || typeof value !== "object")
    throw new Error("Invalid template manifest: expected an object");
  const manifest = value as Record<string, unknown>;
  const allowed = new Set([
    "$schema",
    "name",
    "displayName",
    "defaultPackageManager",
    "exclude",
    "rewrite",
    "postCreate",
  ]);
  for (const key of Object.keys(manifest)) {
    if (!allowed.has(key))
      throw new Error(`Invalid template manifest: unknown field ${key}`);
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    throw new Error("Invalid template manifest: name is required");
  }
  if (
    !Array.isArray(manifest.exclude) ||
    !manifest.exclude.every((item) => typeof item === "string")
  ) {
    throw new Error(
      "Invalid template manifest: exclude must be an array of strings",
    );
  }
  if (
    manifest.defaultPackageManager !== undefined &&
    !["pnpm", "npm", "yarn", "bun"].includes(
      String(manifest.defaultPackageManager),
    )
  ) {
    throw new Error(
      "Invalid template manifest: unsupported defaultPackageManager",
    );
  }
  if (
    manifest.postCreate !== undefined &&
    (!Array.isArray(manifest.postCreate) ||
      !manifest.postCreate.every(
        (item) => typeof item === "string" && item.trim(),
      ))
  ) {
    throw new Error(
      "Invalid template manifest: postCreate must be an array of commands",
    );
  }
  if (manifest.rewrite !== undefined) {
    if (!Array.isArray(manifest.rewrite))
      throw new Error("Invalid template manifest: rewrite must be an array");
    for (const rule of manifest.rewrite) {
      if (!rule || typeof rule !== "object")
        throw new Error(
          "Invalid template manifest: rewrite rule must be an object",
        );
      const entry = rule as Record<string, unknown>;
      const hasValue = typeof entry.value === "string";
      const hasReplace =
        Array.isArray(entry.replace) &&
        entry.replace.length === 2 &&
        entry.replace.every((item) => typeof item === "string");
      if (
        typeof entry.file !== "string" ||
        typeof entry.jsonPath !== "string" ||
        !entry.jsonPath.startsWith("$.") ||
        hasValue === hasReplace
      ) {
        throw new Error("Invalid template manifest: malformed rewrite rule");
      }
    }
  }
}

// ── Exclude matching ───────────────────────────────────────────────────────
//
// Three pattern shapes:
//   1. "**/name"      — matches any path segment named exactly this
//   2. "a/b/c"        — matches relative path prefix or exact
//   3. "name" (bare)  — matches any path segment named exactly this
//
// Intentionally simpler than full gitignore semantics — the manifest is the
// explicit, curated source of truth, not a mirror of .gitignore.

function shouldExclude(relPath: string, excludes: string[]): boolean {
  const parts = relPath.split("/");

  for (const pattern of excludes) {
    if (pattern.startsWith("**/")) {
      if (parts.includes(pattern.slice(3))) return true;
    } else if (pattern.includes("/")) {
      if (relPath === pattern || relPath.startsWith(pattern + "/")) return true;
    } else {
      if (parts.includes(pattern)) return true;
    }
  }
  return false;
}

// ── Walk (for dry-run counts) ──────────────────────────────────────────────

function walkFiles(root: string, excludes: string[]): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      if (shouldExclude(rel, excludes)) continue;
      if (entry.isDirectory()) walk(full);
      else out.push(rel);
    }
  }
  walk(root);
  return out;
}

function countFiles(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else n++;
  }
  return n;
}

// ── JSON path + var substitution ───────────────────────────────────────────

function getByPath(obj: unknown, jsonPath: string): unknown {
  const parts = jsonPath
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setByPath(obj: unknown, jsonPath: string, value: unknown): void {
  const parts = jsonPath
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean);
  if (parts.length === 0) return;
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== "object") return;
    const rec = cur as Record<string, unknown>;
    if (rec[parts[i]] == null || typeof rec[parts[i]] !== "object") {
      rec[parts[i]] = {};
    }
    cur = rec[parts[i]];
  }
  if (cur != null && typeof cur === "object") {
    (cur as Record<string, unknown>)[parts[parts.length - 1]] = value;
  }
}

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(
    /\{\{(\w+)\}\}/g,
    (_, name: string) => vars[name] ?? `{{${name}}}`,
  );
}

function applyRewrites(
  targetDir: string,
  rules: RewriteRule[] | undefined,
  vars: Record<string, string>,
  dryRun: boolean,
): number {
  if (!rules || rules.length === 0) return 0;
  let applied = 0;

  for (const rule of rules) {
    const filePath = join(targetDir, rule.file);

    if (!existsSync(filePath)) {
      throw new Error(`Rewrite target not found after copy: ${rule.file}`);
    }

    const json = JSON.parse(readFileSync(filePath, "utf-8"));

    if (rule.jsonPath && rule.value !== undefined) {
      setByPath(json, rule.jsonPath, substituteVars(rule.value, vars));
      applied++;
    } else if (rule.jsonPath && rule.replace) {
      const [search, replacement] = rule.replace;
      const current = getByPath(json, rule.jsonPath);
      if (typeof current === "string") {
        setByPath(
          json,
          rule.jsonPath,
          current.replace(search, substituteVars(replacement, vars)),
        );
        applied++;
      }
    }

    if (!dryRun) {
      writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n");
    }
  }

  return applied;
}

// ── Orchestration ──────────────────────────────────────────────────────────

export function scaffold(opts: ScaffoldOptions): ScaffoldResult {
  const manifest = readManifest(opts.templateRoot);
  const vars: Record<string, string> = {
    packageName: opts.packageName,
    devHost: opts.devHost,
  };
  const plannedRewrites = manifest.rewrite ?? [];

  if (opts.dryRun) {
    const files = walkFiles(opts.templateRoot, manifest.exclude);
    return {
      fileCount: files.length,
      rewriteCount: plannedRewrites.length,
      plannedRewrites,
    };
  }

  if (existsSync(opts.targetDir)) {
    if (!opts.force)
      throw new Error(`Target directory already exists: ${opts.targetDir}`);
    rmSync(opts.targetDir, { recursive: true, force: true });
  }

  cpSync(opts.templateRoot, opts.targetDir, {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const rel = relative(opts.templateRoot, source);
      if (rel === "" || rel === ".") return true;
      return !shouldExclude(rel, manifest.exclude);
    },
  });

  const rewriteCount = applyRewrites(
    opts.targetDir,
    manifest.rewrite,
    vars,
    false,
  );
  const fileCount = countFiles(opts.targetDir);

  return { fileCount, rewriteCount, plannedRewrites };
}
