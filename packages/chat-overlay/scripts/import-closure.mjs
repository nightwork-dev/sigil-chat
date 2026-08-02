// Overlay import-closure check (DX.9).
//
// Design-system components must reach consumers from the owned-source
// registry (ui.nightwork.dev) or the Design scaffold's base template — never
// as an implicit overlay file dependency the overlay forgot to carry. This
// walks every `@workspace/ui/*` import reachable from the files Chat's
// overlay actually stages and resolves each one to:
//   (a) a file the overlay itself stages (self-contained fork), or
//   (b) a registry item Design publishes at ui.nightwork.dev, or
//   (c) a base-template file every scaffolded product already gets from the
//       Design template copy (no overlay or registry involvement needed).
// Anything else is a payload-stripping gap: the overlay ships a component
// that imports something no consumer can actually resolve.
//
// The staged-file set is never hand-maintained here — it comes from
// stageOverlay()/overlayPaths, the same authority the package/publish/CI
// paths use.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { repositoryRoot, walkStagedFiles } from "./stage-overlay.mjs";

const CODE_EXTENSION_PATTERN = /\.(tsx?|jsx?)$/;

// `@workspace/ui/*` export map (packages/ui/package.json "exports"), plus
// the one non-pattern export (globals.css) used across the overlay.
const EXPORT_PREFIXES = [
  { prefix: "components/", srcDir: "src/components/", extensions: [".tsx", ".ts"] },
  { prefix: "hooks/", srcDir: "src/hooks/", extensions: [".ts", ".tsx"] },
  { prefix: "lib/", srcDir: "src/lib/", extensions: [".ts", ".tsx"] },
];

const IMPORT_PATTERNS = [
  /(?:from|import)\s+["'](@workspace\/ui\/[^"']+)["']/g,
  /import\(\s*["'](@workspace\/ui\/[^"']+)["']\s*\)/g,
  /require\(\s*["'](@workspace\/ui\/[^"']+)["']\s*\)/g,
];

export function resolveDesignRoot(env = process.env) {
  const candidates = [
    env.SIGIL_DESIGN_ROOT,
    join(repositoryRoot, "..", "sigil-design"),
    join(repositoryRoot, "..", "sigil-design-game-integration"),
    join(repositoryRoot, "..", "..", "sigil-design"),
    join(repositoryRoot, "..", "..", "sigil-design-game-integration"),
  ]
    .filter(Boolean)
    .map((candidate) => resolve(candidate));

  for (const designRoot of candidates) {
    if (
      existsSync(join(designRoot, "packages/ui/registry.json")) &&
      existsSync(join(designRoot, "packages/ui/src"))
    ) {
      return designRoot;
    }
  }

  throw new Error(
    [
      "Sigil Design checkout not found for the overlay import-closure check.",
      "Set SIGIL_DESIGN_ROOT to a checkout containing packages/ui/registry.json,",
      "or place a sigil-design checkout beside this repository/worktree.",
    ].join(" "),
  );
}

// Registry item file targets look like "@ui/blocks/kanban-board.tsx",
// "@lib/color.ts", "@hooks/use-debounce-with-cooldown.ts" — translate each
// to the packages/ui-relative source path it publishes so it can be matched
// against a resolved import path.
const REGISTRY_TARGET_PREFIXES = [
  { prefix: "@ui/", srcDir: "src/components/" },
  { prefix: "@lib/", srcDir: "src/lib/" },
  { prefix: "@hooks/", srcDir: "src/hooks/" },
];

export function readRegistryRelPaths(designRoot) {
  const registryPath = join(designRoot, "packages/ui/registry.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const relPaths = new Set();
  for (const item of registry.items ?? []) {
    for (const file of item.files ?? []) {
      const target = file.target;
      if (typeof target !== "string") continue;
      const match = REGISTRY_TARGET_PREFIXES.find(({ prefix }) =>
        target.startsWith(prefix),
      );
      if (!match) continue;
      relPaths.add(`${match.srcDir}${target.slice(match.prefix.length)}`);
    }
  }
  return relPaths;
}

// A `@workspace/ui/<subpath>` import resolves to zero or more candidate
// packages/ui-relative source paths (extension is implicit in the import
// specifier, so try every extension the export map allows).
export function candidateRelPaths(rawSubpath) {
  // Strip Vite-style resource query suffixes (e.g. "globals.css?url") — the
  // suffix is a bundler instruction, not part of the module path.
  const subpath = rawSubpath.replace(/\?.*$/, "");
  if (subpath === "globals.css") return ["src/styles/globals.css"];
  const match = EXPORT_PREFIXES.find(({ prefix }) => subpath.startsWith(prefix));
  if (!match) return [];
  const rest = subpath.slice(match.prefix.length);
  if (CODE_EXTENSION_PATTERN.test(rest) || rest.endsWith(".css")) {
    return [`${match.srcDir}${rest}`];
  }
  return match.extensions.map((extension) => `${match.srcDir}${rest}${extension}`);
}

export function extractWorkspaceUiImports(source) {
  const subpaths = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      subpaths.add(match[1].slice("@workspace/ui/".length));
    }
  }
  return [...subpaths];
}

/**
 * Walk every `@workspace/ui/*` import reachable from the overlay's own
 * staged files and resolve each one against: files the overlay itself
 * stages, Design's live registry, and Design's live base-template source
 * tree. Returns the full accounting so callers can assert on violations and
 * report resolution provenance.
 */
export function checkImportClosure({ filesRoot, designRoot }) {
  const stagedFiles = walkStagedFiles(filesRoot).filter((path) =>
    CODE_EXTENSION_PATTERN.test(path),
  );
  const stagedRelSet = new Set(
    stagedFiles.map((path) => relativeToFilesRoot(filesRoot, path)),
  );
  const stagedUiRelPaths = new Set(
    [...stagedRelSet]
      .filter((relPath) => relPath.startsWith("packages/ui/"))
      .map((relPath) => relPath.slice("packages/ui/".length)),
  );
  const registryRelPaths = readRegistryRelPaths(designRoot);

  const violations = [];
  const resolutions = [];

  for (const stagedPath of stagedFiles) {
    const stagedRelPath = relativeToFilesRoot(filesRoot, stagedPath);
    const source = readFileSync(stagedPath, "utf8");
    for (const subpath of extractWorkspaceUiImports(source)) {
      const candidates = candidateRelPaths(subpath);
      if (candidates.length === 0) {
        violations.push({
          file: stagedRelPath,
          import: `@workspace/ui/${subpath}`,
          reason: "import does not match a known @workspace/ui export shape",
          checked: [],
        });
        continue;
      }

      const overlayMatch = candidates.find((rel) => stagedUiRelPaths.has(rel));
      if (overlayMatch) {
        resolutions.push({
          file: stagedRelPath,
          import: `@workspace/ui/${subpath}`,
          kind: "overlay",
          resolvedPath: overlayMatch,
        });
        continue;
      }

      const registryMatch = candidates.find((rel) => registryRelPaths.has(rel));
      if (registryMatch) {
        resolutions.push({
          file: stagedRelPath,
          import: `@workspace/ui/${subpath}`,
          kind: "registry",
          resolvedPath: registryMatch,
        });
        continue;
      }

      const baseTemplateMatch = candidates.find((rel) =>
        existsSync(join(designRoot, "packages/ui", rel)),
      );
      if (baseTemplateMatch) {
        resolutions.push({
          file: stagedRelPath,
          import: `@workspace/ui/${subpath}`,
          kind: "base-template",
          resolvedPath: baseTemplateMatch,
        });
        continue;
      }

      violations.push({
        file: stagedRelPath,
        import: `@workspace/ui/${subpath}`,
        reason:
          "resolves to no overlay-staged file, no registry item, and no base-template file",
        checked: candidates,
      });
    }
  }

  return { violations, resolutions, filesChecked: stagedFiles.length };
}

function relativeToFilesRoot(filesRoot, path) {
  return path.slice(filesRoot.length + 1).replaceAll("\\", "/");
}

export function formatViolations(violations) {
  return violations
    .map(
      (violation) =>
        `- ${violation.file} imports ${violation.import}: ${violation.reason}` +
        (violation.checked.length
          ? ` (checked: ${violation.checked.join(", ")})`
          : ""),
    )
    .join("\n");
}
