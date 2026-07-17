// sigil create <name> — scaffold a new app from the Sigil template.
// Reads template.sigil.json from the template root, copies with excludes,
// applies identity rewrites (package name + dev host).

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";
import { getBool, getString, type ParsedArgs } from "../lib/argv";
import { readManifest, scaffold, type RewriteRule } from "../create/scaffold";
import { parsePackageManager, runLifecycle } from "../create/lifecycle";

export async function createCommand(args: ParsedArgs): Promise<void> {
  const name = getString(args.flags, "name") ?? args.positional[0];

  if (!name) {
    process.stderr.write("sigil create: missing project name\n\n");
    process.stderr.write(
      "Usage: sigil create <name> [--cwd <destination>] [--package-manager <pm>] [--no-install] [--no-git] [--verify] [--force] [--dry-run]\n",
    );
    process.exit(1);
  }

  const dryRun = args.flags.dryRun === true;
  const explicitCwd = getString(args.flags, "cwd");
  const destinationRoot = resolve(explicitCwd ?? process.cwd());

  const templateRoot = findTemplateRoot();
  const manifest = readManifest(templateRoot);

  const targetDir = resolve(destinationRoot, name);
  const packageName = name;
  const devHost = toDevHost(name);
  const packageManager = parsePackageManager(
    getString(args.flags, "packageManager") ??
      manifest.defaultPackageManager ??
      "pnpm",
  );
  const install = getBool(args.flags, "install", true);
  const git = getBool(args.flags, "git", true);
  const verify = getBool(args.flags, "verify");
  const force = getBool(args.flags, "force");

  if (verify && !install) {
    throw new Error(
      "--verify requires dependency installation; remove --no-install",
    );
  }

  if (!dryRun && existsSync(targetDir) && !force) {
    process.stderr.write(
      `sigil create: target directory already exists: ${targetDir}\n`,
    );
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write("Dry run — no files will be written.\n\n");
  }

  const result = scaffold({
    templateRoot,
    targetDir,
    packageName,
    devHost,
    dryRun,
    force,
  });

  if (dryRun) {
    process.stdout.write(
      `Would copy ${result.fileCount} files → ${targetDir}\n`,
    );
    process.stdout.write(
      `Would apply ${result.plannedRewrites.length} rewrite(s):\n`,
    );
    for (const rule of result.plannedRewrites) {
      describeRewrite(rule, packageName, devHost);
    }
    process.stdout.write(
      `\nVariables: packageName=${packageName}  devHost=${devHost}\n`,
    );
    process.stdout.write(
      `Lifecycle: ${install ? `${packageManager} install` : "skip install"}, ${git ? "git init" : "skip git"}${verify ? `, ${packageManager} typecheck` : ""}\n`,
    );
    return;
  }

  const lifecycle = runLifecycle({
    cwd: targetDir,
    packageManager,
    postCreate: manifest.postCreate,
    install,
    git,
    verify,
  });

  process.stdout.write(`\nScaffolded ${packageName} into ${targetDir}\n`);
  process.stdout.write(
    `  ${result.fileCount} files copied, ${result.rewriteCount} rewrite(s) applied\n\n`,
  );
  if (lifecycle.commands.length > 0)
    process.stdout.write(`  completed: ${lifecycle.commands.join(", ")}\n\n`);
  printNextSteps(packageManager, basename(targetDir), devHost, install);
}

function describeRewrite(
  rule: RewriteRule,
  packageName: string,
  devHost: string,
): void {
  const target = rule.jsonPath ? `${rule.file}  ${rule.jsonPath}` : rule.file;
  if (rule.value !== undefined) {
    const resolved = rule.value
      .replace("{{packageName}}", packageName)
      .replace("{{devHost}}", devHost);
    process.stdout.write(`  ${target}  →  ${resolved}\n`);
  } else if (rule.replace) {
    const [, to] = rule.replace;
    const resolved = to
      .replace("{{packageName}}", packageName)
      .replace("{{devHost}}", devHost);
    process.stdout.write(`  ${target}  replace → ${resolved}\n`);
  }
}

function printNextSteps(
  pm: string,
  dir: string,
  devHost: string,
  installed: boolean,
): void {
  process.stdout.write("Next steps:\n");
  process.stdout.write(`  cd ${dir}\n`);
  if (!installed) process.stdout.write(`  ${pm} install\n`);
  process.stdout.write(`  ${pm} dev\n\n`);
  process.stdout.write(`Then visit http://${devHost}.localhost:1355\n`);
}

/**
 * Find the template root by locating template.sigil.json.
 * Walks up from the CLI's current/template checkout until found. --cwd is the
 * destination root, matching conventional create-tool semantics.
 */
function findTemplateRoot(): string {
  const fromCwd = findManifestAncestor(process.cwd());
  if (fromCwd) return fromCwd;

  // Published/bundled invocation: locate the manifest relative to this module,
  // independent of the user's destination cwd.
  const fromPackage = findManifestAncestor(
    dirname(fileURLToPath(import.meta.url)),
  );
  if (fromPackage) return fromPackage;

  const packageDir = findPackageAncestor(
    dirname(fileURLToPath(import.meta.url)),
  );
  const bundled = packageDir ? join(packageDir, "template") : undefined;
  if (bundled && existsSync(join(bundled, "template.sigil.json")))
    return bundled;

  throw new Error("Sigil template is missing from this CLI installation");
}

function findManifestAncestor(start: string): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "template.sigil.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function findPackageAncestor(start: string): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Derive a portless dev-host subdomain from the project name.
 * Strips npm scope, lowercases, replaces non-alphanumeric with hyphens.
 */
function toDevHost(name: string): string {
  return name
    .replace(/^@[^/]+\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
