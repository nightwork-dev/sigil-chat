import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  consumerTransformedPaths,
  coverageRoots,
  overlayPaths,
  requiredWorkspacePackages,
} from "./overlay-paths.mjs";

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
  transformConsumerFiles();
}

export function overlayIncludesPath(relativePath) {
  return overlayPaths.some(
    (overlayPath) =>
      relativePath === overlayPath || relativePath.startsWith(`${overlayPath}/`),
  );
}

export function assertOverlayCoverage() {
  const missing = [];

  for (const [name, root] of Object.entries(coverageRoots)) {
    if (!existsSync(join(repositoryRoot, root))) {
      missing.push(`${name}: missing live root ${root}`);
    } else if (!overlayIncludesPath(root)) {
      missing.push(`${name}: ${root}`);
    }
  }

  for (const packagePath of requiredWorkspacePackages) {
    if (!existsSync(join(repositoryRoot, packagePath, "package.json"))) {
      missing.push(`workspace package missing live package.json: ${packagePath}`);
    } else if (!overlayIncludesPath(packagePath)) {
      missing.push(`workspace package not staged: ${packagePath}`);
    }
  }

  const actualPackagePaths = readdirSync(join(repositoryRoot, "packages"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`)
    .filter((packagePath) => packagePath !== "packages/chat-overlay")
    .filter((packagePath) => packagePath !== "packages/ui")
    .filter((packagePath) =>
      existsSync(join(repositoryRoot, packagePath, "package.json")),
    )
    .sort();
  const required = [...requiredWorkspacePackages].sort();
  const unexpected = actualPackagePaths.filter(
    (packagePath) => !required.includes(packagePath),
  );
  const absent = required.filter(
    (packagePath) => !actualPackagePaths.includes(packagePath),
  );
  for (const packagePath of unexpected) {
    missing.push(`new workspace package is not classified: ${packagePath}`);
  }
  for (const packagePath of absent) {
    missing.push(`required workspace package no longer exists: ${packagePath}`);
  }

  const doctorPath = join(repositoryRoot, "sigil.doctor.json");
  if (existsSync(doctorPath)) {
    const doctor = JSON.parse(readFileSyncUtf8(doctorPath));
    for (const entry of doctor.requiredFiles ?? []) {
      if (!entry || typeof entry.path !== "string") continue;
      if (!existsSync(join(repositoryRoot, entry.path))) {
        missing.push(`doctor required file missing live path: ${entry.path}`);
      } else if (!overlayIncludesPath(entry.path)) {
        missing.push(`doctor required file not staged: ${entry.path}`);
      }
    }
    for (const entry of doctor.packageJson ?? []) {
      if (!entry || typeof entry.path !== "string") continue;
      if (!existsSync(join(repositoryRoot, entry.path))) {
        missing.push(`doctor packageJson target missing live path: ${entry.path}`);
      } else if (!overlayIncludesPath(entry.path)) {
        missing.push(`doctor packageJson target not staged: ${entry.path}`);
      }
    }
    for (const entry of doctor.environment ?? []) {
      if (!entry || typeof entry.path !== "string") continue;
      if (!existsSync(join(repositoryRoot, entry.path))) {
        missing.push(`doctor environment file missing live path: ${entry.path}`);
      } else if (!overlayIncludesPath(entry.path)) {
        missing.push(`doctor environment file not staged: ${entry.path}`);
      }
    }
    for (const entry of doctor.sourceChecks ?? []) {
      if (!entry || typeof entry.path !== "string") continue;
      if (!existsSync(join(repositoryRoot, entry.path))) {
        missing.push(`doctor sourceCheck target missing live path: ${entry.path}`);
      } else if (!overlayIncludesPath(entry.path)) {
        missing.push(`doctor sourceCheck target not staged: ${entry.path}`);
      }
    }
  } else {
    missing.push("doctor config missing live path: sigil.doctor.json");
  }

  if (missing.length > 0) {
    throw new Error(
      `Sigil Chat overlay coverage is stale:\n${missing
        .map((item) => `- ${item}`)
        .join("\n")}`,
    );
  }
}

export function walkStagedFiles(root = filesRoot) {
  const files = [];
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }
  if (existsSync(root) && statSync(root).isDirectory()) walk(root);
  return files;
}

function readFileSyncUtf8(path) {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    readFileSync(path),
  );
}

function transformConsumerFiles() {
  const rootPackagePath = join(filesRoot, "package.json");
  const rootPackage = JSON.parse(readFileSyncUtf8(rootPackagePath));
  if (rootPackage?.scripts && typeof rootPackage.scripts === "object") {
    delete rootPackage.scripts["overlay:stage"];
  }
  writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);

  const workspacePath = join(filesRoot, "pnpm-workspace.yaml");
  const workspace = readFileSyncUtf8(workspacePath)
    .split("\n")
    .filter((line) => !line.includes("packages/chat-overlay"))
    .join("\n")
    .replace(/\n*$/, "\n");
  writeFileSync(workspacePath, workspace);

  for (const path of consumerTransformedPaths) {
    if (!existsSync(join(filesRoot, path))) {
      throw new Error(`Consumer transform target was not staged: ${path}`);
    }
  }
}

function isGeneratedPath(path) {
  const relative = path.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
  if (relative.endsWith("routeTree.gen.ts")) return true;
  return relative
    .split("/")
    .some((segment) =>
      [
        ".env",
        ".data",
        ".omc",
        ".git",
        ".next",
        ".nitro",
        ".tanstack",
        ".vercel",
        ".vinxi",
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
