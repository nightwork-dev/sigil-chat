import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { overlayPaths } from "./overlay-paths.mjs";

export const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const repositoryRoot = resolve(packageRoot, "../..");
export const filesRoot = join(packageRoot, "files");

export function stageOverlay() {
  rmSync(filesRoot, { recursive: true, force: true });
  mkdirSync(filesRoot, { recursive: true });
  for (const relativePath of overlayPaths) {
    const source = join(repositoryRoot, relativePath);
    if (!existsSync(source)) {
      throw new Error(`Overlay source is missing: ${relativePath}`);
    }
    const target = join(filesRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      recursive: true,
      dereference: true,
      filter: (candidate) => !isGeneratedPath(candidate),
    });
  }
}

function isGeneratedPath(path) {
  const relative = path.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
  return relative
    .split("/")
    .some((segment) =>
      [
        ".env",
        "node_modules",
        "dist",
        ".turbo",
        ".output",
        ".vite",
        ".eve",
        "coverage",
      ].includes(segment),
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) stageOverlay();
