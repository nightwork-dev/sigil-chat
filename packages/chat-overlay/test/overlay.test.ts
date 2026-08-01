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
  consumerTransformedPaths,
  coverageRoots,
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
      ...(doctor.sourceChecks ?? []).map((entry: { path: string }) => entry.path),
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
    const stagedPaths = walk(filesRoot).map((path) => relative(filesRoot, path));
    expect(stagedPaths).not.toContain("apps/web/src/routes/-types.ts");
    for (const path of [
      "apps/web/src/routes/footer.tsx",
      "apps/web/src/routes/footer/index.tsx",
      "apps/web/src/routes/index.tsx",
      "apps/web/src/routes/inspector.tsx",
      "apps/web/src/routes/inspector/index.tsx",
      "apps/web/src/routes/menubar.tsx",
      "apps/web/src/routes/menubar/index.tsx",
      "apps/web/src/routes/menubar/workflow.tsx",
      "apps/web/src/routes/settings.tsx",
      "apps/web/src/routes/settings/appearance.tsx",
      "apps/web/src/routes/settings/general.tsx",
      "apps/web/src/routes/settings/index.tsx",
      "apps/web/src/routes/settings/notifications.tsx",
      "apps/web/src/routes/sidebar.tsx",
      "apps/web/src/routes/sidebar/canvas.tsx",
      "apps/web/src/routes/sidebar/index.tsx",
      "apps/web/src/routes/split.tsx",
      "apps/web/src/routes/split/$id.tsx",
      "apps/web/src/routes/split/index.tsx",
    ]) {
      expect(stagedPaths).not.toContain(path);
    }
    expect(
      stagedPaths.some((path) =>
        /^packages\/agent-(?:eve|gonk|react|react-query|surface)(?:\/|$)/.test(
          path,
        ),
      ),
    ).toBe(false);
    for (const staged of walk(filesRoot)) {
      const sourceRelativePath = relative(filesRoot, staged);
      for (const privateSegment of [".env", ".data", ".omc"]) {
        expect(sourceRelativePath.split("/")).not.toContain(privateSegment);
      }
      expect(sourceRelativePath.endsWith("routeTree.gen.ts")).toBe(false);
      if (consumerTransformedPaths.includes(sourceRelativePath)) {
        continue;
      }
      const source = join(repositoryRoot, sourceRelativePath);
      expect(readFileSync(staged)).toEqual(readFileSync(source));
    }
    const stagedRootPackage = JSON.parse(
      readFileSync(join(filesRoot, "package.json"), "utf8"),
    );
    const stagedDevPrepare = readFileSync(
      join(filesRoot, "scripts/dev-prepare.mjs"),
      "utf8",
    );
    expect(stagedRootPackage.scripts).not.toHaveProperty("overlay:stage");
    expect(stagedDevPrepare).not.toContain('"--filter", "web"');
    expect(stagedDevPrepare).toContain(
      '"--dir", "apps/web", "exec", "tsx", "scripts/auth-seed-dev.ts"',
    );
    expect(
      readFileSync(join(filesRoot, "pnpm-workspace.yaml"), "utf8"),
    ).not.toContain("packages/chat-overlay");
  }, 60_000);

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
      ".agents/skills/agentic-workspace-development/SKILL.md",
      ".claude/skills/agentic-workspace-development/SKILL.md",
      ".pi/skills/agentic-workspace-development/SKILL.md",
      "docs/guides/building-workspaces.md",
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

  it.skipIf(!process.env.SIGIL_DESIGN_ROOT)(
    "is consumable with the registry payload by the Sigil Design CLI",
    () => {
    const cli = resolveConfiguredDesignCli();

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
        cli.path,
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
      { cwd: cli.designRoot, stdio: "pipe" },
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
    expect(
      statSync(
        join(
          target,
          ".agents/skills/agentic-workspace-development/SKILL.md",
        ),
      ).isFile(),
    ).toBe(true);
    expect(
      readFileSync(
        join(target, "docs/guides/building-workspaces.md"),
        "utf8",
      ),
    ).toContain("usePublishWorkspaceResourceScope");

    expect(item.overlay.name).toBe("sigil-chat");
    expect(item.digest).toBe(
      digestRegistryItem({
        name: item.name,
        version: item.version,
        overlay: item.overlay,
        files: item.files,
      }),
    );

    const rootPackage = JSON.parse(
      readFileSync(join(target, "package.json"), "utf8"),
    );
    const webPackage = JSON.parse(
      readFileSync(join(target, "apps/web/package.json"), "utf8"),
    );
    const agentPackage = JSON.parse(
      readFileSync(join(target, "apps/agent/package.json"), "utf8"),
    );
    const doctor = JSON.parse(
      readFileSync(join(target, "sigil.doctor.json"), "utf8"),
    );
    const devPrepare = readFileSync(
      join(target, "scripts/dev-prepare.mjs"),
      "utf8",
    );
    expect(rootPackage.scripts).not.toHaveProperty("overlay:stage");
    expect(rootPackage.scripts["auth:generate"]).toBe(
      "pnpm --dir apps/web auth:generate",
    );
    expect(rootPackage.scripts["auth:migrate"]).toBe(
      "pnpm --dir apps/web auth:migrate",
    );
    expect(
      readFileSync(join(target, "pnpm-workspace.yaml"), "utf8"),
    ).not.toContain("packages/chat-overlay");
    expect(webPackage.name).toBe(`${targetName}-web`);
    expect(webPackage.scripts.dev).toBe(
      `portless ${targetName} vite dev --host`,
    );
    expect(agentPackage.name).toBe(`${targetName}-agent`);
    expect(agentPackage.scripts.dev).toContain(`--name ${targetName}-agent `);
    expect(doctor.id).toBe(`sigil-${targetName}`);
    expect(doctor.serviceProbes[0].url).toBe(
      `http://${targetName}-agent.localhost:1355/eve/v1/health`,
    );
    expect(devPrepare).not.toContain('"--filter", "web"');
    expect(devPrepare).toContain(
      '"--dir", "apps/web", "exec", "tsx", "scripts/auth-seed-dev.ts"',
    );
  }, 30_000);

  it.skipIf(!process.env.SIGIL_DESIGN_ROOT)(
    "is consumable by the landed Sigil Design overlay protocol",
    () => {
    const cli = resolveConfiguredDesignCli();
    const target = join(scratch, "generated-chat");
    execFileSync(
      "node",
      [
        cli.path,
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
      { cwd: cli.designRoot, stdio: "pipe" },
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
    expect(
      statSync(
        join(
          target,
          ".agents/skills/agentic-workspace-development/SKILL.md",
        ),
      ).isFile(),
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

function resolveConfiguredDesignCli(): { designRoot: string; path: string } {
  const configuredRoot = process.env.SIGIL_DESIGN_ROOT;
  if (!configuredRoot) {
    throw new Error(
      "SIGIL_DESIGN_ROOT is required for Sigil Design CLI integration tests",
    );
  }

  const designRoot = configuredRoot;
  const path = join(designRoot, "packages/cli/dist/sigil.js");
  if (existsSync(path)) return { designRoot, path };

  throw new Error(
    `SIGIL_DESIGN_ROOT was set, but packages/cli/dist/sigil.js was not found under ${configuredRoot}`,
  );
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
