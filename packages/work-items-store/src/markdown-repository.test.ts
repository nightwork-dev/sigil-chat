import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { createWorkItemsDocument } from "./sample";
import {
  MarkdownWorkItemsRepository,
  assertSafeStoryId,
  resolveRoadmapDir,
} from "./markdown-repository";

const temporaryDirectories: string[] = [];

async function makeStore(): Promise<{
  dir: string;
  repo: MarkdownWorkItemsRepository;
}> {
  const dir = await mkdtemp(join(tmpdir(), "sigil-roadmap-store-"));
  temporaryDirectories.push(dir);
  return {
    dir,
    repo: new MarkdownWorkItemsRepository({
      dir,
      now: () => "2026-07-18T20:00:00.000Z",
    }),
  };
}

function gitLog(dir: string): string[] {
  return execFileSync("git", ["-C", dir, "log", "--pretty=%s"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("MarkdownWorkItemsRepository", () => {
  it("seeds the roadmap as one markdown file per story and round-trips get/list", async () => {
    const { dir, repo } = await makeStore();

    const stories = await repo.list();
    expect(stories).toHaveLength(createWorkItemsDocument().stories.length);
    expect(stories).toHaveLength(3);

    // One .md per story plus index.md and _reviews.md.
    expect(existsSync(join(dir, "S1.1.md"))).toBe(true);
    expect(existsSync(join(dir, "index.md"))).toBe(true);
    expect(existsSync(join(dir, "_reviews.md"))).toBe(true);

    const document = await repo.get();
    expect(document.revision).toBe(0);
    expect(document.reviews).toHaveLength(2);
    expect(document.stories.find(({ id }) => id === "S1.1")).toMatchObject({
      epicId: "roadmap",
      status: "ready",
      routing: "pi:luna",
      reviewGate: "peer",
      deps: ["S1.0"],
      worktree: "sigil-chat-dev",
    });
  });

  it("initializes the store dir as its own git repo and commits every mutation", async () => {
    const { dir, repo } = await makeStore();
    await repo.get(); // triggers init + seed commit

    expect(existsSync(join(dir, ".git"))).toBe(true);
    expect(gitLog(dir)).toEqual(["roadmap: seed initial stories"]);

    await repo.transitionStory("S0.3", "in-progress");
    await repo.addComment({
      id: "comment-1",
      storyId: "S0.3",
      kind: "reference",
      author: "Owner",
      body: "Landed the commits.",
      createdAt: "2026-07-18T20:01:00.000Z",
    });

    const log = gitLog(dir);
    // Newest first: comment, then transition, then the seed.
    expect(log).toEqual([
      "story S0.3: comment comment-1",
      "story S0.3: ready→in-progress",
      "roadmap: seed initial stories",
    ]);
  });

  it("filters list() by worktree", async () => {
    const { repo } = await makeStore();

    const story = (await repo.list()).find(({ id }) => id === "S0.3");
    if (!story) throw new Error("Missing seed story S0.3.");
    await repo.upsertStory(
      { ...story, worktree: "sigil-chat-s15" },
      0,
    );

    const s15 = await repo.list({ worktree: "sigil-chat-s15" });
    expect(s15.map(({ id }) => id)).toEqual(["S0.3"]);

    const dev = await repo.list({ worktree: "sigil-chat-dev" });
    expect(dev.length).toBe(2);
    expect(dev.find(({ id }) => id === "S0.3")).toBeUndefined();

    const readyOnDev = await repo.list({
      worktree: "sigil-chat-dev",
      status: "ready",
    });
    expect(readyOnDev.every((item) => item.status === "ready")).toBe(true);
    expect(readyOnDev.every((item) => item.worktree === "sigil-chat-dev")).toBe(
      true,
    );
  });

  it("reflects a manual .md edit on the next read", async () => {
    const { dir, repo } = await makeStore();
    await repo.get(); // seed

    const file = join(dir, "S0.3.md");
    const original = await readFile(file, "utf8");
    expect(original).toContain("status: ready");
    await writeFile(file, original.replace("status: ready", "status: verify"));

    // A fresh repository parses the directory from disk.
    const reopened = new MarkdownWorkItemsRepository({ dir });
    const story = (await reopened.list()).find(({ id }) => id === "S0.3");
    expect(story?.status).toBe("verify");
  });

  it("persists reviews, comments, and revision across a reopen", async () => {
    const { dir, repo } = await makeStore();

    let document = await repo.get();
    document = (
      await repo.assignReview(
        "S1.0",
        { assignee: "Owner", gate: "decision:owner" },
        document.revision,
      )
    ).document;
    // Two reviews are pre-seeded, so this one is review-S1.0-3.
    document = (
      await repo.decideReview(
        "review-S1.0-3",
        "changes-requested",
        "Owner",
        document.revision,
      )
    ).document;
    document = (
      await repo.addComment(
        {
          id: "comment-shape",
          storyId: "S1.0",
          kind: "concern",
          author: "Owner",
          body: "One more pass on the shape decision.",
          createdAt: "2026-07-18T20:02:00.000Z",
        },
        document.revision,
      )
    ).document;

    const reopened = await new MarkdownWorkItemsRepository({ dir }).get();
    expect(reopened.revision).toBe(document.revision);
    expect(reopened.reviews.find(({ id }) => id === "review-S1.0-3")).toMatchObject(
      {
        decision: "changes-requested",
        completed: true,
        unread: false,
      },
    );
    expect(reopened.stories.find(({ id }) => id === "S1.0")).toMatchObject({
      reviewDecision: "changes-requested",
      decidedBy: "Owner",
    });
    expect(reopened.comments).toEqual([
      {
        id: "comment-shape",
        storyId: "S1.0",
        kind: "concern",
        author: "Owner",
        body: "One more pass on the shape decision.",
        createdAt: "2026-07-18T20:02:00.000Z",
      },
    ]);
  });

  it("rejects a stale mutation on the optimistic revision counter", async () => {
    const { repo } = await makeStore();
    const initial = await repo.get();
    await repo.transitionStory("S0.3", "in-progress", initial.revision);

    await expect(
      repo.assignReview("S0.3", { assignee: "Owner", gate: "peer" }, initial.revision),
    ).rejects.toThrow(
      `Work-items revision conflict: expected ${initial.revision}, current ${initial.revision + 1}.`,
    );
  });
});

describe("resolveRoadmapDir", () => {
  it("prefers an explicit override and an env var over the co-located default", () => {
    expect(resolveRoadmapDir(undefined, "/tmp/custom-roadmap")).toBe(
      "/tmp/custom-roadmap",
    );
    expect(resolveRoadmapDir("/tmp/env-roadmap", undefined)).toBe(
      "/tmp/env-roadmap",
    );
  });

  it("falls back to a co-located sigil-roadmap dir beside the main repo", () => {
    const resolved = resolveRoadmapDir(undefined, undefined, process.cwd());
    expect(resolved.endsWith("/sigil-roadmap")).toBe(true);
    // Portable: derived from the git common dir, not a hardcoded home path.
    expect(resolved).not.toContain("/worktrees/");
  });
});

describe("assertSafeStoryId", () => {
  it("accepts real story ids and rejects path traversal", () => {
    expect(() => assertSafeStoryId("S1.5")).not.toThrow();
    expect(() => assertSafeStoryId("EXP.13")).not.toThrow();
    for (const bad of [
      "",
      "../escape",
      "a/b",
      "a\\b",
      "_reviews",
      ".hidden",
      "index",
      "with space",
    ]) {
      expect(() => assertSafeStoryId(bad)).toThrow();
    }
  });
});
