import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  candidateRelPaths,
  checkImportClosure,
  readRegistryRelPaths,
  resolveDesignRoot,
} from "../scripts/import-closure.mjs";
import { filesRoot, stageOverlay } from "../scripts/stage-overlay.mjs";

const scratch = mkdtempSync(join(tmpdir(), "sigil-chat-import-closure-"));

beforeAll(() => stageOverlay(), 30_000);
afterAll(() => {
  rmSync(filesRoot, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe("Sigil Chat overlay import closure", () => {
  it("resolves every @workspace/ui import reachable from the real staged overlay", () => {
    const designRoot = resolveDesignRoot();
    const result = checkImportClosure({ filesRoot, designRoot });

    expect(result.filesChecked).toBeGreaterThan(0);
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual(
      [],
    );
    // The overlay stages hundreds of files that never touch @workspace/ui —
    // assert the walk actually found real imports, not an accidental no-op.
    expect(result.resolutions.length).toBeGreaterThan(0);
  }, 30_000);

  it("resolves an import to the live registry when a registry item covers it", () => {
    const designRoot = resolveDesignRoot();
    const registryRelPaths = readRegistryRelPaths(designRoot);
    // tone-chip is the DX.9 precedent dependency — assert Design's live
    // registry still carries it, so the fixture below stays representative.
    expect(registryRelPaths.has("src/components/tone-chip.tsx")).toBe(true);
  });
});

describe("Sigil Chat overlay import closure — regression fixture (DX.9 quest-log/tone-chip gap)", () => {
  let fixtureRoot: string;

  afterEach(() => {
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("goes RED when a staged file imports a component absent from both registry and base template", () => {
    fixtureRoot = mkdtempSync(join(scratch, "gap-"));
    const stagedFiles = join(fixtureRoot, "staged");
    const designRoot = join(fixtureRoot, "design");

    // Reproduce the historical shape: an overlay-staged component
    // ("verification-queue-overlay.tsx") imports a sibling component
    // ("quest-log") that the overlay never staged and Design never
    // published — the exact registry-manifest gap from the 2026-08-02 Game
    // upgrade failure.
    writeStagedFile(
      stagedFiles,
      "packages/ui/src/components/verification-queue-overlay.tsx",
      `import { QuestLog } from "@workspace/ui/components/quest-log"\nexport const VerificationQueueOverlay = () => <QuestLog />\n`,
    );
    writeDesignRegistry(designRoot, { items: [] });

    const result = checkImportClosure({ filesRoot: stagedFiles, designRoot });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      file: "packages/ui/src/components/verification-queue-overlay.tsx",
      import: "@workspace/ui/components/quest-log",
    });
    expect(result.violations[0].checked).toEqual(
      expect.arrayContaining(["src/components/quest-log.tsx"]),
    );
  });

  it("stays GREEN once the dependency is published as a registry item", () => {
    fixtureRoot = mkdtempSync(join(scratch, "fixed-registry-"));
    const stagedFiles = join(fixtureRoot, "staged");
    const designRoot = join(fixtureRoot, "design");

    writeStagedFile(
      stagedFiles,
      "packages/ui/src/components/verification-queue-overlay.tsx",
      `import { QuestLog } from "@workspace/ui/components/quest-log"\nexport const VerificationQueueOverlay = () => <QuestLog />\n`,
    );
    writeDesignRegistry(designRoot, {
      items: [
        {
          name: "quest-log",
          type: "registry:ui",
          files: [
            {
              path: ".registry-staging/src/components/quest-log.tsx",
              type: "registry:ui",
              target: "@ui/quest-log.tsx",
            },
          ],
        },
      ],
    });

    const result = checkImportClosure({ filesRoot: stagedFiles, designRoot });

    expect(result.violations).toEqual([]);
    expect(result.resolutions).toEqual([
      expect.objectContaining({
        import: "@workspace/ui/components/quest-log",
        kind: "registry",
        resolvedPath: "src/components/quest-log.tsx",
      }),
    ]);
  });

  it("stays GREEN once the dependency ships as a Design base-template file", () => {
    fixtureRoot = mkdtempSync(join(scratch, "fixed-base-template-"));
    const stagedFiles = join(fixtureRoot, "staged");
    const designRoot = join(fixtureRoot, "design");

    writeStagedFile(
      stagedFiles,
      "packages/ui/src/components/verification-queue-overlay.tsx",
      `import { ToneChip } from "@workspace/ui/components/tone-chip"\nexport const VerificationQueueOverlay = () => <ToneChip />\n`,
    );
    writeDesignRegistry(designRoot, { items: [] });
    mkdirSync(join(designRoot, "packages/ui/src/components"), {
      recursive: true,
    });
    writeFileSync(
      join(designRoot, "packages/ui/src/components/tone-chip.tsx"),
      "export const ToneChip = () => null\n",
    );

    const result = checkImportClosure({ filesRoot: stagedFiles, designRoot });

    expect(result.violations).toEqual([]);
    expect(result.resolutions).toEqual([
      expect.objectContaining({
        import: "@workspace/ui/components/tone-chip",
        kind: "base-template",
        resolvedPath: "src/components/tone-chip.tsx",
      }),
    ]);
  });
});

describe("candidateRelPaths", () => {
  it("strips Vite resource-query suffixes before resolving", () => {
    expect(candidateRelPaths("globals.css?url")).toEqual([
      "src/styles/globals.css",
    ]);
  });

  it("tries both component extensions for an extensionless import", () => {
    expect(candidateRelPaths("components/tone-chip")).toEqual([
      "src/components/tone-chip.tsx",
      "src/components/tone-chip.ts",
    ]);
  });

  it("returns no candidates for an import shape outside the known export map", () => {
    expect(candidateRelPaths("package.json")).toEqual([]);
  });
});

function writeStagedFile(
  stagedFilesRoot: string,
  relativePath: string,
  contents: string,
): void {
  const target = join(stagedFilesRoot, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function writeDesignRegistry(
  designRoot: string,
  registry: { items: unknown[] },
): void {
  const registryPath = join(designRoot, "packages/ui/registry.json");
  mkdirSync(join(registryPath, ".."), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}
