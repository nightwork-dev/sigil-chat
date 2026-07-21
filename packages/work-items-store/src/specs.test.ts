import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { MemorySpecsRepository, MirkSpecsRepository } from "./specs.js";

const directories: string[] = [];
const NOW = "2026-07-21T21:15:00.000Z";

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
  authoredBy: "Codex",
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
});
