import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  filesRoot,
  packageRoot,
  repositoryRoot,
  stageOverlay,
} from "../scripts/stage-overlay.mjs";
import { overlayPaths } from "../scripts/overlay-paths.mjs";

const scratch = mkdtempSync(join(tmpdir(), "sigil-chat-overlay-"));

beforeAll(() => stageOverlay(), 30_000);
afterAll(() => {
  rmSync(filesRoot, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

describe("Sigil Chat overlay", () => {
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
        const source = join(repositoryRoot, sourceRelativePath);
      expect(readFileSync(staged)).toEqual(readFileSync(source));
    }
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
    expect(statSync(join(target, "apps/gonk/package.json")).isFile()).toBe(
      true,
    );
    expect(
      statSync(join(target, "apps/web/src/routes/_app/chat.tsx")).isFile(),
    ).toBe(true);
  });
});

function walk(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}
