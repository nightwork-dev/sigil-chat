import { describe, expect, it } from "vitest";
import {
  parsePackageManager,
  runLifecycle,
  type CommandRunner,
} from "./lifecycle";

function recorder(output: string[]): CommandRunner {
  return (command, args, cwd) =>
    output.push(`${cwd}: ${[command, ...args].join(" ")}`);
}

describe("create lifecycle", () => {
  it("uses the selected package manager for manifest install hooks", () => {
    const calls: string[] = [];
    const result = runLifecycle({
      cwd: "/tmp/project",
      packageManager: "bun",
      postCreate: ["pnpm install"],
      install: true,
      git: true,
      verify: true,
      runner: recorder(calls),
    });

    expect(result.commands).toEqual([
      "bun install",
      "git init",
      "/tmp/project/apps/web/node_modules/.bin/vite build",
      "bun typecheck",
    ]);
    expect(calls).toEqual([
      "/tmp/project: bun install",
      "/tmp/project: git init",
      "/tmp/project/apps/web: /tmp/project/apps/web/node_modules/.bin/vite build",
      "/tmp/project: bun typecheck",
    ]);
  });

  it("skips install hooks and git when disabled", () => {
    const calls: string[] = [];
    runLifecycle({
      cwd: "/tmp/project",
      packageManager: "pnpm",
      postCreate: ["pnpm install", "node scripts/finish.mjs"],
      install: false,
      git: false,
      verify: false,
      runner: recorder(calls),
    });
    expect(calls).toEqual(["/tmp/project: node scripts/finish.mjs"]);
  });

  it("adds an install when the manifest has no install hook", () => {
    const calls: string[] = [];
    runLifecycle({
      cwd: "/tmp/project",
      packageManager: "npm",
      install: true,
      git: false,
      verify: true,
      runner: recorder(calls),
    });
    expect(calls).toEqual([
      "/tmp/project: npm install",
      "/tmp/project/apps/web: /tmp/project/apps/web/node_modules/.bin/vite build",
      "/tmp/project: npm run typecheck",
    ]);
  });

  it("rejects unsupported package managers", () => {
    expect(() => parsePackageManager("deno")).toThrow(
      /Unsupported package manager/,
    );
  });
});
