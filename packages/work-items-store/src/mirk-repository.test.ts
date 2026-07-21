import { execFileSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MarkdownWorkItemsRepository,
  resolveRoadmapDir,
} from "./markdown-repository.js";
import { MirkWorkItemsRepository } from "./mirk-repository.js";

const temporaryDirectories: string[] = [];
const NOW = "2026-07-18T20:00:00.000Z";

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sigil-mirk-roadmap-"));
  temporaryDirectories.push(directory);
  return directory;
}

function gitLog(directory: string): string[] {
  return execFileSync("git", ["-C", directory, "log", "--pretty=%s"], {
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

describe("MirkWorkItemsRepository", () => {
  it("seeds, reads, mutates, and commits through the WorkItemsRepository seam", async () => {
    const directory = await makeDirectory();
    const repository = new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
    });

    let document = await repository.get();
    expect(document.stories).toHaveLength(3);
    expect(document.reviews).toHaveLength(2);
    expect(gitLog(directory)).toEqual(["roadmap: seed initial stories"]);

    document = (
      await repository.transitionStory("S0.3", "in-progress", document.revision)
    ).document;
    document = (
      await repository.assignReview(
        "S0.3",
        { assignee: "Owner", gate: "decision:owner" },
        document.revision,
      )
    ).document;
    document = (
      await repository.decideReview(
        "review-S0.3-3",
        "changes-requested",
        "Owner",
        document.revision,
      )
    ).document;
    await repository.addComment(
      {
        id: "comment-mirk",
        storyId: "S0.3",
        kind: "reference",
        author: "Owner",
        body: "Mirk now owns the backing.",
        createdAt: NOW,
      },
      document.revision,
    );

    const reopened = await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
    }).get();
    expect(reopened.revision).toBe(4);
    expect(reopened.comments).toContainEqual({
      id: "comment-mirk",
      storyId: "S0.3",
      kind: "reference",
      author: "Owner",
      body: "Mirk now owns the backing.",
      createdAt: NOW,
    });
    expect(
      reopened.reviews.find(({ id }) => id === "review-S0.3-3"),
    ).toMatchObject({
      decision: "changes-requested",
      completed: true,
      unread: false,
    });
    expect(gitLog(directory)).toEqual([
      "story S0.3: comment comment-mirk",
      "review review-S0.3-3: changes-requested",
      "story S0.3: assign decision:owner review",
      "story S0.3: ready→in-progress",
      "roadmap: seed initial stories",
    ]);
  });

  it("round-trips a copy of the legacy markdown format byte-for-byte", async () => {
    const sourceDirectory = process.env.S15B_ROADMAP_COPY;
    if (
      sourceDirectory &&
      resolve(sourceDirectory) === resolve(resolveRoadmapDir())
    )
      throw new Error(
        "Round-trip verification must never use the live roadmap.",
      );

    const legacyDirectory = await makeDirectory();
    const mirkDirectory = sourceDirectory ?? (await makeDirectory());
    if (sourceDirectory) {
      await cp(sourceDirectory, legacyDirectory, { recursive: true });
    } else {
      const legacy = new MarkdownWorkItemsRepository({
        dir: legacyDirectory,
        now: () => NOW,
      });
      await legacy.get();
      await cp(legacyDirectory, mirkDirectory, {
        recursive: true,
        filter: (source) =>
          !source.includes("/.git/") && !source.endsWith("/.git"),
      });
      await rm(join(mirkDirectory, ".git"), { recursive: true, force: true });
    }

    const legacy = new MarkdownWorkItemsRepository({
      dir: legacyDirectory,
      now: () => NOW,
    });
    const initial = await legacy.get();

    const mirk = new MirkWorkItemsRepository({
      dir: mirkDirectory,
      now: () => NOW,
    });
    expect(await mirk.list()).toEqual(await legacy.list());
    expect(await mirk.get()).toMatchObject({
      revision: initial.revision,
      comments: initial.comments,
      reviews: initial.reviews,
    });

    const comment = {
      id: "comment-round-trip",
      storyId: "S0.3",
      kind: "reference" as const,
      author: "Owner",
      body: "Byte compatibility is the contract.",
      createdAt: NOW,
    };
    await legacy.addComment(comment, initial.revision);
    await mirk.addComment(comment, initial.revision);

    const storyPath = join("S0.3.md");
    const oldStory = await readFile(join(legacyDirectory, storyPath), "utf8");
    const mirkStory = await readFile(join(mirkDirectory, storyPath), "utf8");
    const oldIndex = await readFile(join(legacyDirectory, "index.md"), "utf8");
    const mirkIndex = await readFile(join(mirkDirectory, "index.md"), "utf8");
    const storyNames = sourceDirectory
      ? ["S0.3.md"]
      : (await readdir(legacyDirectory)).filter(
          (name) =>
            name.endsWith(".md") &&
            name !== "index.md" &&
            !name.startsWith("_"),
        );
    const storyDiffs: string[] = [];
    for (const name of storyNames) {
      const expected = await readFile(join(legacyDirectory, name), "utf8");
      const actual = await readFile(join(mirkDirectory, name), "utf8");
      if (expected !== actual) storyDiffs.push(name);
    }
    const oldReviews = await readFile(
      join(legacyDirectory, "_reviews.md"),
      "utf8",
    );
    const mirkReviews = await readFile(
      join(mirkDirectory, "_reviews.md"),
      "utf8",
    );
    if (process.env.S15B_LEGACY_SNAPSHOT)
      await cp(legacyDirectory, process.env.S15B_LEGACY_SNAPSHOT, {
        recursive: true,
      });
    expect(storyDiffs).toEqual([]);
    expect(mirkStory).toBe(oldStory);
    expect(mirkIndex).toBe(oldIndex);
    expect(mirkReviews).toBe(oldReviews);
    expect(mirkStory).toContain("## Comments\n\n```yaml");
    expect(gitLog(mirkDirectory)[0]).toBe(
      "story S0.3: comment comment-round-trip",
    );

    console.log(
      JSON.stringify({
        stories: (await mirk.list()).length,
        storyIdsMatch:
          (await mirk.list()).map(({ id }) => id).join(",") ===
          (await legacy.list()).map(({ id }) => id).join(","),
        storyFilesCompared: storyNames.length,
        storyDiff: storyDiffs.length === 0 ? "none" : storyDiffs,
        indexDiff: mirkIndex === oldIndex ? "none" : "different",
        reviewsDiff: mirkReviews === oldReviews ? "none" : "different",
        latestCommit: gitLog(mirkDirectory)[0],
      }),
    );
  });

  it("persists saved board views as a sidecar without changing story identity", async () => {
    const directory = await makeDirectory();
    const repository = new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
    });
    const initial = await repository.get();
    const storyBefore = await readFile(join(directory, "S0.3.md"), "utf8");
    const view = {
      id: "project-a-roadmap",
      ownerScopeId: "project-a",
      name: "Project A roadmap",
      visibility: "private" as const,
      roots: ["project-a"],
      traversal: "self-and-rollups" as const,
      filters: {},
      groupBy: "scope" as const,
      revision: 1,
    };

    await repository.upsertBoardView(view, initial.revision);

    const reopened = new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
    });
    expect(await reopened.listBoardViews()).toEqual([view]);
    expect(await readFile(join(directory, "S0.3.md"), "utf8")).toBe(storyBefore);
    expect((await reopened.list()).map(({ id }) => id)).toContain("S0.3");
  });

  it("loads idea-stage stories (no acceptance criteria) and skips a corrupt file", async () => {
    const directory = await makeDirectory();
    // Seed the store so the collection + index exist.
    await new MirkWorkItemsRepository({ dir: directory, now: () => NOW }).get();

    const frontmatter = (
      id: string,
      status: string,
      extraBody: string[],
    ): string =>
      [
        "---",
        `id: ${id}`,
        "epicId: track-x",
        "epicTitle: Ideas",
        `title: ${id} title`,
        `status: ${status}`,
        "routing: strategy",
        "reviewGate: decision:owner",
        "deps: []",
        "authoredBy: Owner",
        `createdAt: ${NOW}`,
        `updatedAt: ${NOW}`,
        "---",
        "",
        "A body preamble that becomes the intent.",
        "",
        ...extraBody,
      ].join("\n");

    // Idea-stage story: a sketch, NO "## Acceptance criteria" section. This is
    // the D4.6 case that used to fail-close the entire board.
    await writeFile(
      join(directory, "IDEA9.md"),
      frontmatter("IDEA9", "idea", ["## Shape sketch", "", "- explore later"]),
    );
    // A genuinely-corrupt story (invalid status enum) must be skipped, not
    // fatal — one bad file cannot take down the whole board.
    await writeFile(
      join(directory, "BROKEN9.md"),
      frontmatter("BROKEN9", "not-a-real-status", [
        "## Acceptance criteria",
        "",
        "- x",
      ]),
    );

    // The board must survive a corrupt file without discarding valid stories.
    // — list() resolves instead of throwing, the idea story loads, and the
    // corrupt one is dropped rather than taking everything down with it.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ids = (
      await new MirkWorkItemsRepository({
        dir: directory,
        now: () => NOW,
      }).list()
    ).map((story) => story.id);
    warn.mockRestore();

    expect(ids).toContain("IDEA9"); // idea story with no ACs is valid
    expect(ids).not.toContain("BROKEN9"); // corrupt file dropped, board survives
  });
});
