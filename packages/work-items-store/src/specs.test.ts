import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  createSqliteCoordinator,
  type CoordinationGuard,
  SqliteCoordinator,
} from "@mirk/store/coordination";

import { MemorySpecsRepository, MirkSpecsRepository } from "./specs.js";

const directories: string[] = [];
const NOW = "2026-07-21T21:15:00.000Z";
const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const TSX_ESM_LOADER = join(
  PACKAGE_DIR,
  "node_modules",
  "tsx",
  "dist",
  "esm",
  "index.mjs",
);

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const createInput = {
  id: "SPEC.1",
  title: "Durable specifications",
  summary: "Make specifications first-class roadmap records.",
  body: "# Durable specifications\n\nThe full contract lives here.\n\n## Contract\n\nOne durable record.",
  storyIds: ["S1.10"],
  authoredBy: "Automation",
};

describe("MemorySpecsRepository", () => {
  it("creates, revises, filters, and transitions a spec", async () => {
    const repository = new MemorySpecsRepository([], () => NOW);

    const created = await repository.create(createInput, 0);
    expect(created).toMatchObject({
      revision: 1,
      changedIds: ["SPEC.1"],
      spec: { status: "draft", storyIds: ["S1.10"] },
    });

    const revised = await repository.revise(
      "SPEC.1",
      { body: "# Revised\n\nA sharper contract.", storyIds: ["S1.10", "SC.5"] },
      1,
    );
    expect(revised.revision).toBe(2);
    expect(await repository.list({ storyId: "SC.5" })).toHaveLength(1);

    const accepted = await repository.transition("SPEC.1", "accepted", 2);
    expect(accepted).toMatchObject({
      revision: 3,
      spec: { status: "accepted" },
    });
    expect(await repository.list({ status: "draft" })).toEqual([]);
  });

  it("never turns a create collision into an update", async () => {
    const repository = new MemorySpecsRepository([], () => NOW);
    await repository.create(createInput);
    await expect(repository.create(createInput, 1)).rejects.toThrow(
      "Spec id already exists: SPEC.1.",
    );
  });

  it("rejects stale revisions", async () => {
    const repository = new MemorySpecsRepository([], () => NOW);
    await repository.create(createInput, 0);
    await expect(
      repository.revise("SPEC.1", { summary: "Stale" }, 0),
    ).rejects.toThrow("Specs revision conflict: expected 0, current 1.");
  });
});

describe("MirkSpecsRepository", () => {
  it("persists specs beside roadmap work and commits each mutation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-specs-"));
    directories.push(directory);
    const repository = new MirkSpecsRepository({
      dir: directory,
      now: () => NOW,
    });

    await repository.create(createInput, 0);
    await repository.revise("SPEC.1", { summary: "Revised summary" }, 1);
    await repository.transition("SPEC.1", "review", 2);

    const reopened = new MirkSpecsRepository({
      dir: directory,
      now: () => NOW,
    });
    await expect(reopened.revision()).resolves.toBe(3);
    await expect(reopened.get("SPEC.1")).resolves.toMatchObject({
      summary: "Revised summary",
      status: "review",
      storyIds: ["S1.10"],
    });
    const markdown = await readFile(
      join(directory, "specs", "SPEC.1.md"),
      "utf8",
    );
    expect(markdown).toContain("# Specification");
    expect(markdown).toContain("## Contract");
    expect(
      execFileSync("git", ["-C", directory, "log", "--pretty=%s"], {
        encoding: "utf8",
      })
        .trim()
        .split("\n"),
    ).toEqual([
      "spec SPEC.1: draft→review",
      "spec SPEC.1: revise",
      "spec SPEC.1: create",
    ]);
  });

  it("serializes writers across repository instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-specs-"));
    directories.push(directory);
    const first = new MirkSpecsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });
    const second = new MirkSpecsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });

    const writes = await Promise.allSettled([
      first.create(createInput, 0),
      second.create({ ...createInput, id: "SPEC.2" }, 0),
    ]);
    expect(writes.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(writes.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    await expect(first.revision()).resolves.toBe(1);
    await expect(first.list()).resolves.toHaveLength(1);
  });

  it("uses Mirk coordination state under .locks instead of .specs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-specs-"));
    directories.push(directory);
    const repository = new MirkSpecsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });

    await repository.create(createInput, 0);

    expect(existsSync(join(directory, ".locks", "coordination.sqlite"))).toBe(
      true,
    );
    expect(existsSync(join(directory, ".specs", "coordination.sqlite"))).toBe(
      false,
    );
    expect(existsSync(join(directory, ".specs", "state.md"))).toBe(true);
  });

  it("serializes writers across real processes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-specs-"));
    directories.push(directory);
    const script = `
      import { MirkSpecsRepository } from "./src/specs.ts";
      void (async () => {
        const repository = new MirkSpecsRepository({
          dir: ${JSON.stringify(directory)},
          now: () => ${JSON.stringify(NOW)},
          git: false,
          coordination: { waitMs: 2000, leaseMs: 250, renewEveryMs: 50 },
        });
        const id = process.argv[1];
        try {
          await repository.create({
            id,
            title: "Process " + id,
            summary: "Created from another process.",
            body: "# Process spec\\n\\nOne process wins the revision.",
            storyIds: ["S1.10"],
            authoredBy: "Automation",
          }, 0);
          console.log("created:" + id);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        }
      })();
    `;

    const [first, second] = await Promise.all([
      runNodeWithTsx(script, ["SPEC.P1"]),
      runNodeWithTsx(script, ["SPEC.P2"]),
    ]);

    expect([first.code, second.code].sort()).toEqual([0, 1]);
    expect(`${first.stdout}${second.stdout}`).toMatch(/created:SPEC\.P[12]/);
    expect(`${first.stderr}${second.stderr}`).toContain(
      "Specs revision conflict: expected 0, current 1.",
    );
    await expect(
      new MirkSpecsRepository({ dir: directory, git: false }).revision(),
    ).resolves.toBe(1);
  });

  it("recovers a stale owner left by a killed process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-specs-"));
    directories.push(directory);
    const lockPath = join(directory, ".locks", "coordination.sqlite");
    const holder = spawn(
      process.execPath,
      [
        "--import",
        TSX_ESM_LOADER,
        "--input-type=module",
        "--eval",
        `
          import { mkdir } from "node:fs/promises";
          import { join } from "node:path";
          import { createSqliteCoordinator } from "@mirk/store/coordination";
          void (async () => {
            const root = ${JSON.stringify(directory)};
            await mkdir(join(root, ".locks"), { recursive: true });
            const coordinator = createSqliteCoordinator({
              path: ${JSON.stringify(lockPath)},
              namespace: "work-items-specs",
            });
            await coordinator.runExclusive(
              "specs",
              async () => {
                console.log("held");
                await new Promise(() => {});
              },
              { leaseMs: 50, renewEveryMs: 10, waitMs: 1000 },
            );
          })();
        `,
      ],
      { cwd: PACKAGE_DIR, stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForOutput(holder, "held");
    holder.kill("SIGKILL");
    await waitForExit(holder);

    const repository = new MirkSpecsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
      coordination: { waitMs: 2000, leaseMs: 80, renewEveryMs: 20 },
    });
    await expect(repository.create(createInput, 0)).resolves.toMatchObject({
      revision: 1,
      spec: { id: "SPEC.1" },
    });
  });

  it("refuses the next external phase after ownership loss", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-specs-"));
    directories.push(directory);
    const lockPath = join(directory, ".locks", "coordination.sqlite");
    let stolen = false;
    const repository = new MirkSpecsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
      coordination: { waitMs: 1000, leaseMs: 1000, renewEveryMs: 100 },
    });
    const internals = repository as unknown as {
      assertOwned(guard: CoordinationGuard): Promise<void>;
    };
    const assertOwned = internals.assertOwned.bind(repository);
    let ownershipCheck = 0;
    internals.assertOwned = async (guard) => {
      ownershipCheck += 1;
      if (ownershipCheck === 3 && !stolen) {
        stolen = true;
        const coordinator = new SqliteCoordinator({
          path: lockPath,
          namespace: "work-items-specs",
          now: () => Date.now() + 10_000,
        });
        await coordinator.runExclusive("specs", async () => undefined, {
          waitMs: 1000,
          leaseMs: 100,
          renewEveryMs: 20,
        });
        coordinator.close();
      }
      await assertOwned(guard);
    };

    await expect(repository.create(createInput, 0)).rejects.toThrow(
      /Lost ownership of coordination key "specs"/,
    );
    expect(ownershipCheck).toBe(3);
    await expect(repository.revision()).resolves.toBe(0);
    await expect(repository.get("SPEC.1")).resolves.toBeUndefined();
  });
});

function runNodeWithTsx(
  script: string,
  args: string[] = [],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        TSX_ESM_LOADER,
        "--input-type=module",
        "--eval",
        script,
        ...args,
      ],
      {
        cwd: PACKAGE_DIR,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function waitForOutput(
  child: ReturnType<typeof spawn>,
  text: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for "${text}".`)),
      2000,
    );
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (!chunk.includes(text)) return;
      clearTimeout(timeout);
      resolve();
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Process exited before "${text}" with ${code}.`));
    });
  });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => child.on("exit", () => resolve()));
}
