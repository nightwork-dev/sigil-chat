import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const target = join(packageRoot, "template");
const manifest = JSON.parse(
  readFileSync(join(repoRoot, "template.sigil.json"), "utf-8"),
);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const entry of readdirSync(repoRoot)) {
  copyEntry(join(repoRoot, entry), join(target, entry));
}

function copyEntry(source, destination) {
  const rel = relative(repoRoot, source);
  if (
    rel === "packages/cli/template" ||
    rel.startsWith("packages/cli/template/") ||
    manifest.exclude.some((pattern) => matches(rel, pattern))
  )
    return;

  if (statSync(source).isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) {
      copyEntry(join(source, entry), join(destination, entry));
    }
  } else {
    copyFileSync(source, destination);
  }
}

function matches(path, pattern) {
  const parts = path.split("/");
  if (pattern.startsWith("**/")) return parts.includes(pattern.slice(3));
  if (pattern.includes("/"))
    return path === pattern || path.startsWith(`${pattern}/`);
  return parts.includes(pattern);
}
