import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readManifest, scaffold } from "./scaffold";

function fixture(): { root: string; target: string } {
  const base = mkdtempSync(join(tmpdir(), "sigil-scaffold-"));
  const root = join(base, "template");
  const target = join(base, "output");
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  mkdirSync(join(root, "node_modules"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "template" }),
  );
  writeFileSync(
    join(root, "apps", "web", "package.json"),
    JSON.stringify({ scripts: { dev: "portless sigil vite" } }),
  );
  writeFileSync(join(root, "node_modules", "ignored"), "x");
  writeFileSync(
    join(root, "template.sigil.json"),
    JSON.stringify({
      name: "fixture",
      exclude: ["node_modules"],
      rewrite: [
        { file: "package.json", jsonPath: "$.name", value: "{{packageName}}" },
        {
          file: "apps/web/package.json",
          jsonPath: "$.scripts.dev",
          replace: ["portless sigil", "portless {{devHost}}"],
        },
      ],
    }),
  );
  return { root, target };
}

describe("scaffold", () => {
  it("copies, excludes, and rewrites a manifest fixture", () => {
    const { root, target } = fixture();
    const result = scaffold({
      templateRoot: root,
      targetDir: target,
      packageName: "new-app",
      devHost: "new-app",
      dryRun: false,
    });
    expect(result.rewriteCount).toBe(2);
    expect(
      JSON.parse(readFileSync(join(target, "package.json"), "utf8")).name,
    ).toBe("new-app");
    expect(
      JSON.parse(readFileSync(join(target, "apps/web/package.json"), "utf8"))
        .scripts.dev,
    ).toContain("portless new-app");
    expect(existsSync(join(target, "node_modules"))).toBe(false);
  });

  it("requires force to replace an existing target", () => {
    const { root, target } = fixture();
    mkdirSync(target);
    writeFileSync(join(target, "stale"), "old");
    expect(() =>
      scaffold({
        templateRoot: root,
        targetDir: target,
        packageName: "new-app",
        devHost: "new-app",
        dryRun: false,
      }),
    ).toThrow(/already exists/);

    scaffold({
      templateRoot: root,
      targetDir: target,
      packageName: "new-app",
      devHost: "new-app",
      dryRun: false,
      force: true,
    });
    expect(existsSync(join(target, "stale"))).toBe(false);
  });

  it("does not mutate an existing target during dry run", () => {
    const { root, target } = fixture();
    mkdirSync(target);
    writeFileSync(join(target, "keep"), "yes");
    const result = scaffold({
      templateRoot: root,
      targetDir: target,
      packageName: "new-app",
      devHost: "new-app",
      dryRun: true,
      force: true,
    });
    expect(result.fileCount).toBeGreaterThan(0);
    expect(readFileSync(join(target, "keep"), "utf8")).toBe("yes");
  });

  it("rejects a malformed template manifest", () => {
    const { root } = fixture();
    writeFileSync(
      join(root, "template.sigil.json"),
      JSON.stringify({ name: "broken", exclude: "node_modules" }),
    );
    expect(() => readManifest(root)).toThrow(/exclude must be an array/);
  });
});
