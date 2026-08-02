import { execFileSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownWorkItemsRepository } from "./markdown-repository.js";
import {
  MirkWorkItemsRepository,
  restoreStoryMarkdownNarrative,
} from "./mirk-repository.js";
import { createWorkItemsDocument } from "./sample.js";

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

async function seedStory(id: string) {
  const story = createWorkItemsDocument().stories.find(
    (candidate) => candidate.id === id,
  );
  if (!story) throw new Error(`Missing seed story ${id}.`);
  return structuredClone(story);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("MirkWorkItemsRepository", () => {
  it("preserves checked criteria and narrative comments across structured rewrites", () => {
    const previous = [
      "---",
      "id: S1",
      "---",
      "",
      "Intent",
      "",
      "## Acceptance criteria",
      "",
      "- [x] Already delivered",
      "- [ ] Still open",
      "",
      "## Comments",
      "",
      "- Historical implementation note.",
      "",
      "```yaml",
      "- id: old-comment",
      "```",
      "",
    ].join("\n");
    const rewritten = [
      "---",
      "id: S1",
      "---",
      "",
      "Intent",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] Already delivered",
      "- [ ] Still open",
      "",
      "## Comments",
      "",
      "```yaml",
      "- id: old-comment",
      "- id: new-comment",
      "```",
      "",
    ].join("\n");

    const restored = restoreStoryMarkdownNarrative(previous, rewritten);

    expect(restored).toContain("- [x] Already delivered");
    expect(restored).toContain("- [ ] Still open");
    expect(restored).toContain("- Historical implementation note.");
    expect(restored).toContain("- id: new-comment");
  });

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

  it("shares story changes and rejects a stale writer across instances", async () => {
    const directory = await makeDirectory();
    const human = new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });
    const agent = new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });

    const initial = await human.get();
    const story = await seedStory("S0.3");
    story.status = "in-progress";
    const humanEdit = await human.upsertStory(story, initial.revision);
    expect(humanEdit.changedIds).toEqual(["S0.3"]);

    expect(
      (await agent.get()).stories.find(({ id }) => id === "S0.3"),
    ).toMatchObject({ status: "in-progress" });

    await expect(
      agent.transitionStory("S0.3", "verify", initial.revision),
    ).rejects.toThrow(
      `Work-items revision conflict: expected ${initial.revision}, current ${initial.revision + 1}.`,
    );
    expect((await human.get()).revision).toBe(initial.revision + 1);
  });

  it("persists review decisions, comments, and git history across reloads", async () => {
    const directory = await makeDirectory();
    const repository = new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
    });

    let document = await repository.get();
    document = (
      await repository.assignReview(
        "S1.0",
        { assignee: "Owner", gate: "decision:owner" },
        document.revision,
      )
    ).document;
    // Two reviews are pre-seeded, so the review assigned above is
    // review-S1.0-3 (document.reviews.length + 1 at assignment time).
    document = (
      await repository.decideReview(
        "review-S1.0-3",
        "changes-requested",
        "Owner",
        document.revision,
      )
    ).document;
    document = (
      await repository.addComment(
        {
          id: "comment-shape-decision",
          storyId: "S1.0",
          kind: "concern",
          author: "Owner",
          body: "The dedicated workspace decision needs one more pass.",
          createdAt: "2026-07-18T20:01:00.000Z",
        },
        document.revision,
      )
    ).document;

    const reloaded = await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
    }).get();
    expect(reloaded.revision).toBe(document.revision);
    expect(
      reloaded.reviews.find(({ id }) => id === "review-S1.0-3"),
    ).toMatchObject({
      decision: "changes-requested",
      unread: false,
      completed: true,
    });
    expect(reloaded.stories.find(({ id }) => id === "S1.0")).toMatchObject({
      reviewDecision: "changes-requested",
      decidedBy: "Owner",
    });
    expect(reloaded.comments).toHaveLength(1);
    expect(gitLog(directory).slice(0, 3)).toEqual([
      "story S1.0: comment comment-shape-decision",
      "review review-S1.0-3: changes-requested",
      "story S1.0: assign decision:owner review",
    ]);
  });

  it("does not apply a stale mutation", async () => {
    const directory = await makeDirectory();
    const repository = new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });
    const initial = await repository.get();

    await repository.transitionStory("S0.3", "in-progress", initial.revision);

    await expect(
      repository.assignReview(
        "S0.3",
        { assignee: "Owner", gate: "peer" },
        initial.revision,
      ),
    ).rejects.toThrow(
      `Work-items revision conflict: expected ${initial.revision}, current ${initial.revision + 1}.`,
    );
    // The rejected assignReview must not have appended a third review on top
    // of the two pre-seeded reviews.
    expect((await repository.get()).reviews).toHaveLength(2);
  });

  it("round-trips the canonical markdown format byte-for-byte", async () => {
    const markdownDirectory = await makeDirectory();
    const mirkDirectory = await makeDirectory();
    const markdown = new MarkdownWorkItemsRepository({
      dir: markdownDirectory,
      now: () => NOW,
    });
    const initial = await markdown.get();
    await cp(markdownDirectory, mirkDirectory, {
      recursive: true,
      filter: (source) =>
        !source.includes("/.git/") && !source.endsWith("/.git"),
    });
    await rm(join(mirkDirectory, ".git"), { recursive: true, force: true });

    const mirk = new MirkWorkItemsRepository({
      dir: mirkDirectory,
      now: () => NOW,
    });
    expect(await mirk.list()).toEqual(await markdown.list());
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
    await markdown.addComment(comment, initial.revision);
    await mirk.addComment(comment, initial.revision);

    const storyPath = join("S0.3.md");
    const oldStory = await readFile(join(markdownDirectory, storyPath), "utf8");
    const mirkStory = await readFile(join(mirkDirectory, storyPath), "utf8");
    const oldIndex = await readFile(
      join(markdownDirectory, "index.md"),
      "utf8",
    );
    const mirkIndex = await readFile(join(mirkDirectory, "index.md"), "utf8");
    const storyNames = (await readdir(markdownDirectory)).filter(
      (name) =>
        name.endsWith(".md") && name !== "index.md" && !name.startsWith("_"),
    );
    const storyDiffs: string[] = [];
    for (const name of storyNames) {
      const expected = await readFile(join(markdownDirectory, name), "utf8");
      const actual = await readFile(join(mirkDirectory, name), "utf8");
      if (expected !== actual) storyDiffs.push(name);
    }
    const oldReviews = await readFile(
      join(markdownDirectory, "_reviews.md"),
      "utf8",
    );
    const mirkReviews = await readFile(
      join(mirkDirectory, "_reviews.md"),
      "utf8",
    );
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
          (await markdown.list()).map(({ id }) => id).join(","),
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
    expect(await readFile(join(directory, "S0.3.md"), "utf8")).toBe(
      storyBefore,
    );
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
        "kind: story",
        'homeScopeId: "installation:default"',
        "scopeBindings: []",
        "provenance:",
        "  origin: principal",
        "  actorPrincipalId: principal-test",
        `  createdAt: ${NOW}`,
        "revision: 1",
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

  it("repairs an index that omits story files added outside this process", async () => {
    const directory = await makeDirectory();
    await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    }).get();

    const source = await readFile(join(directory, "S0.3.md"), "utf8");
    await writeFile(
      join(directory, "S0.4.md"),
      source
        .replace("id: S0.3", "id: S0.4")
        .replace("title: Verify the integration baseline", "title: Added elsewhere"),
      "utf8",
    );

    const staleIndex = await readFile(join(directory, "index.md"), "utf8");
    expect(staleIndex).not.toContain("S0.4 · Added elsewhere");

    await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    }).get();

    const repairedIndex = await readFile(join(directory, "index.md"), "utf8");
    expect(repairedIndex).toContain("S0.3 · Verify the integration baseline");
    expect(repairedIndex).toContain("S0.4 · Added elsewhere");
  });
});

// VQ.1 — the optional `verify:` block. The roadmap holds 180+ story files
// authored before this field existed, so the read path has to treat it as
// additive in every direction: absent, well-formed, and malformed all still
// yield a loadable story.
describe("MirkWorkItemsRepository — verify: block (VQ.1)", () => {
  async function writeStoryWithFrontmatter(
    directory: string,
    id: string,
    extraFrontmatter: string,
  ): Promise<void> {
    const source = await readFile(join(directory, "S0.3.md"), "utf8");
    const patched = source.replace(
      "id: S0.3",
      `id: ${id}${extraFrontmatter ? `\n${extraFrontmatter}` : ""}`,
    );
    await writeFile(join(directory, `${id}.md`), patched, "utf8");
  }

  it("parses a well-formed block and leaves stories without one untouched", async () => {
    const directory = await makeDirectory();
    await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    }).get();

    await writeStoryWithFrontmatter(
      directory,
      "VQ-OK",
      [
        "verify:",
        "  url: /settings?section=models",
        "  steps:",
        "    - Open Settings and pick Models.",
        "    - Toggle a discovered model off and reload.",
      ].join("\n"),
    );

    const document = await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    }).get();

    expect(
      document.stories.find((story) => story.id === "VQ-OK")?.verify,
    ).toEqual({
      url: "/settings?section=models",
      steps: [
        "Open Settings and pick Models.",
        "Toggle a discovered model off and reload.",
      ],
    });
    // The pre-existing seed stories still load, still carry no block.
    expect(document.stories.find((story) => story.id === "S0.3")?.verify).toBe(
      undefined,
    );
    expect(document.stories.length).toBeGreaterThan(1);
  });

  it("keeps a story loadable when its block is malformed", async () => {
    const directory = await makeDirectory();
    await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    }).get();

    // Steps as a bare string, and a numeric entry — both plausible hand-edits.
    await writeStoryWithFrontmatter(
      directory,
      "VQ-BAD",
      ["verify:", "  steps: not-a-list"].join("\n"),
    );
    await writeStoryWithFrontmatter(
      directory,
      "VQ-MIXED",
      ["verify:", "  steps:", "    - 7", "    - Real step."].join("\n"),
    );

    const document = await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    }).get();

    const malformed = document.stories.find((story) => story.id === "VQ-BAD");
    expect(malformed).toBeDefined();
    expect(malformed?.verify).toBe(undefined);

    const mixed = document.stories.find((story) => story.id === "VQ-MIXED");
    expect(mixed?.verify).toEqual({ steps: ["Real step."] });
  });

  it("round-trips the block through a structured rewrite", async () => {
    const directory = await makeDirectory();
    const repository = new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });
    const document = await repository.get();
    const story = await seedStory("S0.3");
    story.verify = { url: "/roadmap?story=S0.3", steps: ["Open the board."] };

    await repository.upsertStory(story, document.revision);

    const raw = await readFile(join(directory, "S0.3.md"), "utf8");
    expect(raw).toContain("verify:");
    expect(raw).toContain("url: /roadmap?story=S0.3");

    const reopened = await new MirkWorkItemsRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    }).get();
    expect(reopened.stories.find((item) => item.id === "S0.3")?.verify).toEqual({
      url: "/roadmap?story=S0.3",
      steps: ["Open the board."],
    });
  });
});
