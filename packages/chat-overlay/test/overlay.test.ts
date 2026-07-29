import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emitRegistryItem } from "../scripts/emit-registry-item.mjs";
import {
  assertOverlayCoverage,
  filesRoot,
  packageRoot,
  repositoryRoot,
  stageOverlay,
} from "../scripts/stage-overlay.mjs";
import {
  coverageRoots,
  overlayTombstoneContent,
  overlayTombstonePaths,
  overlayPaths,
  requiredWorkspacePackages,
} from "../scripts/overlay-paths.mjs";

const scratch = mkdtempSync(join(tmpdir(), "sigil-chat-overlay-"));

beforeAll(() => stageOverlay(), 30_000);
afterAll(() => {
  rmSync(filesRoot, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe("Sigil Chat overlay", () => {
  it("covers the live product routes, workspace packages, launchers, fixtures, and doctor-required files", () => {
    expect(() => assertOverlayCoverage()).not.toThrow();

    expect(pathIsCovered(coverageRoots.productRoutes)).toBe(true);
    expect(pathIsCovered(coverageRoots.productWorkspace)).toBe(true);
    expect(pathIsCovered(coverageRoots.rootLaunchers)).toBe(true);
    expect(pathIsCovered(coverageRoots.fixtures)).toBe(true);
    for (const packagePath of requiredWorkspacePackages) {
      expect(overlayPaths).toContain(packagePath);
    }

    const doctor = JSON.parse(
      readFileSync(join(repositoryRoot, "sigil.doctor.json"), "utf8"),
    );
    const doctorPaths = [
      ...(doctor.requiredFiles ?? []).map((entry: { path: string }) => entry.path),
      ...(doctor.packageJson ?? []).map((entry: { path: string }) => entry.path),
      ...(doctor.environment ?? []).map((entry: { path: string }) => entry.path),
    ];
    for (const doctorPath of doctorPaths) {
      expect(pathIsCovered(doctorPath), doctorPath).toBe(true);
    }
  });

  it("stages only the explicit Chat-owned paths with byte parity", () => {
    for (const path of overlayPaths) {
      const source = join(repositoryRoot, path);
      const staged = join(filesRoot, path);
      expect(statSync(staged).isDirectory()).toBe(
        statSync(source).isDirectory(),
      );
    }
    for (const staged of walk(filesRoot)) {
      const sourceRelativePath = relative(filesRoot, staged);
      for (const privateSegment of [".env", ".agents", ".data", ".omc"]) {
        expect(sourceRelativePath.split("/")).not.toContain(privateSegment);
      }
      expect(sourceRelativePath.endsWith("routeTree.gen.ts")).toBe(false);
      if (overlayTombstonePaths.includes(sourceRelativePath)) {
        expect(readFileSync(staged, "utf8")).toBe(overlayTombstoneContent);
        continue;
      }
      const source = join(repositoryRoot, sourceRelativePath);
      expect(readFileSync(staged)).toEqual(readFileSync(source));
    }
    for (const tombstonePath of overlayTombstonePaths) {
      expect(readFileSync(join(filesRoot, tombstonePath), "utf8")).toBe(
        overlayTombstoneContent,
      );
    }
  }, 30_000);

  it("emits the registry item payload consumed by the Sigil Design CLI lane", () => {
    const output = join(scratch, "chat-overlay.registry.json");
    const { item } = emitRegistryItem({ output });

    expect(item.$schema).toBe(
      "https://ui.nightwork.dev/schemas/sigil-overlay-registry-item.v1.json",
    );
    expect(Object.keys(item).sort()).toEqual([
      "$schema",
      "digest",
      "files",
      "name",
      "overlay",
      "version",
    ]);
    expect(item.name).toBe("chat-overlay");
    expect(item.version).toBe("0.1.1");
    expect(item.overlay.name).toBe("sigil-chat");
    expect(item.overlay.sigilOverlayVersion).toBe(1);
    expect(item.digest).toMatch(/^sha256-[A-Za-z0-9_-]{43}$/);
    expect(item.digest).toBe(
      digestRegistryItem({
        name: item.name,
        version: item.version,
        overlay: item.overlay,
        files: item.files,
      }),
    );
    expect(statSync(output).isFile()).toBe(true);

    const filesByPath = new Map(
      item.files.map(
        (file: {
          path: string;
          encoding: string;
          content: string;
        }) => [file.path, file],
      ),
    );
    for (const requiredPath of [
      "package.json",
      "pnpm-workspace.yaml",
      "scripts/dev.mjs",
      "fixtures/application/sigil-chat.yaml",
      "apps/web/src/routes/_app/chat.tsx",
      "apps/web/src/router.tsx",
      "packages/agent-tools/package.json",
    ]) {
      const file = filesByPath.get(requiredPath);
      expect(file, requiredPath).toBeDefined();
      expect(file?.encoding).toBe("base64");
      expect(Buffer.from(file?.content ?? "", "base64")).toEqual(
        readFileSync(join(filesRoot, requiredPath)),
      );
    }
  }, 30_000);

  it("is consumable as the hosted registry item by the Sigil Design CLI", () => {
    const designRoot =
      process.env.SIGIL_DESIGN_ROOT ??
      "/Users/dr/Dev/templates/worktrees/sigil-design-game-integration";
    const cli = join(designRoot, "packages/cli/dist/sigil.js");
    if (!existsSync(cli)) return;

    const registryRoot = join(scratch, "registry");
    const targetName = "registry-generated-chat";
    const target = join(scratch, targetName);
    mkdirSync(registryRoot, { recursive: true });
    const { item } = emitRegistryItem({
      output: join(registryRoot, "chat-overlay.json"),
    });

    execFileSync(
      "node",
      [
        cli,
        "create",
        targetName,
        "--cwd",
        scratch,
        "--profile",
        "chat",
        "--registry",
        registryRoot,
        "--no-install",
        "--no-git",
      ],
      { cwd: designRoot, stdio: "pipe" },
    );

    expect(readFileSync(join(target, "package.json"), "utf8")).toContain(
      `"name": "${targetName}"`,
    );
    expect(statSync(join(target, "apps/agent/package.json")).isFile()).toBe(
      true,
    );
    expect(
      statSync(join(target, "packages/agent-tools/package.json")).isFile(),
    ).toBe(true);
    expect(
      statSync(join(target, "apps/web/src/routes/_app/chat.tsx")).isFile(),
    ).toBe(true);

    const provenance = JSON.parse(
      readFileSync(join(target, ".sigil", "scaffold.json"), "utf8"),
    ) as {
      overlays: Array<{ registry: string; version: string; digest: string }>;
    };
    expect(provenance.overlays[0]).toEqual(
      expect.objectContaining({
        registry: join(registryRoot, "chat-overlay.json"),
        version: item.version,
        digest: item.digest,
      }),
    );
  }, 30_000);

  it("is consumable by the landed Sigil Design overlay protocol", () => {
    const designRoot = process.env.SIGIL_DESIGN_ROOT;
    if (!designRoot) return;
    const target = join(scratch, "generated-chat");
    execFileSync(
      "node",
      [
        join(designRoot, "packages/cli/dist/sigil.js"),
        "create",
        "generated-chat",
        "--cwd",
        scratch,
        "--profile",
        "chat",
        "--overlay",
        packageRoot,
        "--no-install",
      ],
      { cwd: designRoot, stdio: "pipe" },
    );
    expect(readFileSync(join(target, "package.json"), "utf8")).toContain(
      '"name": "generated-chat"',
    );
    expect(statSync(join(target, "apps/agent/package.json")).isFile()).toBe(
      true,
    );
    expect(
      statSync(join(target, "packages/agent-tools/package.json")).isFile(),
    ).toBe(true);
    expect(
      statSync(join(target, "apps/web/src/routes/_app/chat.tsx")).isFile(),
    ).toBe(true);
  });
});

function pathIsCovered(path: string): boolean {
  return overlayPaths.some(
    (overlayPath) => path === overlayPath || path.startsWith(`${overlayPath}/`),
  );
}

function digestRegistryItem(item: Record<string, unknown>): string {
  const payload = {
    ...item,
    files: [...((item.files as Array<{ path: string }>) ?? [])].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
  };
  return `sha256-${createHash("sha256")
    .update(stableStringify(payload))
    .digest("base64url")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function walk(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}
