import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  addComment,
  assertRevision,
  assignReview,
  decideReview,
  filterBoardViews,
  filterStories,
  isBoardView,
  isReviewItem,
  isStory,
  sortStories,
  transitionStory,
  upsertBoardView,
  upsertStory,
} from "./operations.js";
import { createWorkItemsDocument } from "./sample.js";
import type { WorkItemsRepository } from "./repository.js";
import type {
  BoardView,
  BoardViewFilter,
  ReviewAssignment,
  ReviewDecision,
  ReviewItem,
  Story,
  StoryComment,
  StoryFilter,
  StoryStatus,
  WorkItemsDocument,
  WorkItemsMutationResult,
} from "./types.js";

const INDEX_FILE = "index.md";
const REVIEWS_FILE = "_reviews.md";
const BOARD_VIEWS_FILE = "_board-views.md";
const GIT_IDENTITY = [
  "-c",
  "user.name=Sigil Roadmap",
  "-c",
  "user.email=roadmap@sigil.local",
];

export interface MarkdownWorkItemsRepositoryOptions {
  /**
   * Store directory. Defaults to {@link resolveRoadmapDir} — `SIGIL_ROADMAP_DIR`
   * if set, otherwise a co-located `sigil-roadmap` beside the sigil repos.
   */
  dir?: string;
  now?: () => string;
  /** Disable git integration entirely (file-write only). */
  git?: boolean;
}

/**
 * Persists the roadmap as one markdown file per story (YAML frontmatter + a
 * regenerated `index.md`) inside an EXTERNAL, co-located, self-versioned git
 * repo. Every mutation stages and commits the changed files so the store keeps
 * its own history and can be restored with git. The store repo is independent
 * of sigil-chat's git — it is never nested inside a tracked worktree.
 */
export class MarkdownWorkItemsRepository implements WorkItemsRepository {
  private readonly dirOption?: string;
  private readonly now: () => string;
  private readonly gitEnabled: boolean;

  private resolvedDir?: string;
  private gitAvailable = false;
  private ready?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options?: MarkdownWorkItemsRepositoryOptions) {
    this.dirOption = options?.dir;
    this.now = options?.now ?? (() => new Date().toISOString());
    this.gitEnabled = options?.git ?? true;
  }

  /** The resolved store directory (available after the first operation). */
  get directory(): string {
    if (!this.resolvedDir)
      throw new Error("Markdown roadmap store is not initialized yet.");
    return this.resolvedDir;
  }

  async get(expectedRevision?: number): Promise<WorkItemsDocument> {
    await this.ensureReady();
    const document = await this.readDocument();
    assertRevision(document, expectedRevision);
    return document;
  }

  async list(filter?: StoryFilter): Promise<Story[]> {
    await this.ensureReady();
    const document = await this.readDocument();
    return filterStories(sortStories(document.stories), filter);
  }

  async listBoardViews(filter?: BoardViewFilter): Promise<BoardView[]> {
    await this.ensureReady();
    return filterBoardViews((await this.readDocument()).boardViews, filter);
  }

  async upsertStory(
    story: Story,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => upsertStory(document, story, expectedRevision),
      () => `story ${story.id}: upsert`,
    );
  }

  async upsertBoardView(
    view: BoardView,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => upsertBoardView(document, view, expectedRevision),
      () => `board view ${view.id}: upsert`,
    );
  }

  async transitionStory(
    id: string,
    status: StoryStatus,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => {
        const previous = document.stories.find((story) => story.id === id);
        const from = previous?.status ?? "?";
        return {
          ...transitionStory(document, id, status, this.now, expectedRevision),
          message: `story ${id}: ${from}→${status}`,
        };
      },
      (result) => result.message ?? `story ${id}: →${status}`,
    );
  }

  async assignReview(
    id: string,
    assignment: ReviewAssignment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => assignReview(document, id, assignment, this.now, expectedRevision),
      () => `story ${id}: assign ${assignment.gate} review`,
    );
  }

  async decideReview(
    reviewId: string,
    decision: ReviewDecision,
    decidedBy: string,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) =>
        decideReview(document, reviewId, decision, decidedBy, this.now, expectedRevision),
      () => `review ${reviewId}: ${decision}`,
    );
  }

  async addComment(
    comment: StoryComment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => addComment(document, comment, expectedRevision),
      () => `story ${comment.storyId}: comment ${comment.id}`,
    );
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async mutate(
    operation: (
      document: WorkItemsDocument,
    ) => WorkItemsMutationResult & { message?: string },
    message: (result: WorkItemsMutationResult & { message?: string }) => string,
  ): Promise<WorkItemsMutationResult> {
    return this.runExclusive(async () => {
      await this.ensureReady();
      const document = await this.readDocument();
      const result = operation(document);
      if (result.changedIds.length > 0) {
        await this.persistDocument(result.document);
        this.commit(message(result));
      }
      const { message: _drop, ...clean } = result;
      void _drop;
      return structuredClone(clean);
    });
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.initialize();
    await this.ready;
  }

  private async initialize(): Promise<void> {
    const dir = resolveRoadmapDir(process.env.SIGIL_ROADMAP_DIR, this.dirOption);
    this.resolvedDir = dir;
    await mkdir(dir, { recursive: true });

    if (this.gitEnabled) {
      if (!existsSync(join(dir, ".git"))) {
        this.gitAvailable = this.runGit(dir, ["init"]);
      } else {
        this.gitAvailable = this.runGit(dir, ["rev-parse", "--git-dir"]);
      }
    }

    const stories = await this.readStoryFiles(dir);
    if (stories.length === 0) {
      await this.persistDocument(createWorkItemsDocument());
      this.commit("roadmap: seed initial stories");
    }
  }

  private async readDocument(): Promise<WorkItemsDocument> {
    const dir = this.directory;
    const stories = sortStories(await this.readStoryFiles(dir));
    const comments: StoryComment[] = [];
    for (const story of stories) {
      for (const comment of await this.readCommentsFor(dir, story.id))
        comments.push(comment);
    }
    return {
      revision: await this.readRevision(dir),
      stories,
      comments,
      reviews: await this.readReviews(dir),
      boardViews: await this.readBoardViews(dir),
      history: [],
    };
  }

  private async readStoryFiles(dir: string): Promise<Story[]> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }
    const stories: Story[] = [];
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      if (name === INDEX_FILE || name.startsWith("_")) continue;
      const raw = await readFile(join(dir, name), "utf8");
      stories.push(parseStoryMarkdown(raw, name));
    }
    return stories;
  }

  private async readCommentsFor(
    dir: string,
    id: string,
  ): Promise<StoryComment[]> {
    assertSafeStoryId(id);
    const raw = await readFile(join(dir, `${id}.md`), "utf8");
    return parseCommentsSection(extractSection(bodyOf(raw), "Comments"), id);
  }

  private async readReviews(dir: string): Promise<ReviewItem[]> {
    const path = join(dir, REVIEWS_FILE);
    if (!existsSync(path)) return [];
    const { data } = parseFrontmatter(await readFile(path, "utf8"));
    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    return reviews.map((review, index) => {
      if (!isReviewItem(review))
        throw new Error(
          `Roadmap store is corrupt: invalid review at ${REVIEWS_FILE}[${index}].`,
        );
      return review;
    });
  }

  private async readBoardViews(dir: string): Promise<BoardView[]> {
    const path = join(dir, BOARD_VIEWS_FILE);
    if (!existsSync(path)) return [];
    const { data } = parseFrontmatter(await readFile(path, "utf8"));
    const boardViews = Array.isArray(data.boardViews) ? data.boardViews : [];
    return boardViews.map((view, index) => {
      if (!isBoardView(view))
        throw new Error(
          `Roadmap store is corrupt: invalid board view at ${BOARD_VIEWS_FILE}[${index}].`,
        );
      return view;
    });
  }

  private async readRevision(dir: string): Promise<number> {
    const path = join(dir, INDEX_FILE);
    if (!existsSync(path)) return 0;
    const { data } = parseFrontmatter(await readFile(path, "utf8"));
    return typeof data.revision === "number" &&
      Number.isInteger(data.revision) &&
      data.revision >= 0
      ? data.revision
      : 0;
  }

  private async persistDocument(document: WorkItemsDocument): Promise<void> {
    const dir = this.directory;
    await mkdir(dir, { recursive: true });

    const commentsByStory = new Map<string, StoryComment[]>();
    for (const comment of document.comments) {
      const list = commentsByStory.get(comment.storyId) ?? [];
      list.push(comment);
      commentsByStory.set(comment.storyId, list);
    }

    for (const story of document.stories) {
      assertSafeStoryId(story.id);
      await writeFile(
        join(dir, `${story.id}.md`),
        serializeStoryMarkdown(story, commentsByStory.get(story.id) ?? []),
        "utf8",
      );
    }

    await writeFile(
      join(dir, REVIEWS_FILE),
      serializeReviews(document.reviews),
      "utf8",
    );
    await writeFile(
      join(dir, BOARD_VIEWS_FILE),
      serializeBoardViews(document.boardViews),
      "utf8",
    );
    await writeFile(
      join(dir, INDEX_FILE),
      serializeIndex(document, this.now()),
      "utf8",
    );
  }

  private commit(message: string): void {
    if (!this.gitAvailable || !this.resolvedDir) return;
    const dir = this.resolvedDir;
    if (!this.runGit(dir, ["add", "-A"])) return;
    // `commit` exits non-zero when there is nothing staged; that is fine.
    this.runGit(dir, [...GIT_IDENTITY, "commit", "-m", message], true);
  }

  private runGit(dir: string, args: string[], allowFailure = false): boolean {
    try {
      execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
      return true;
    } catch (error) {
      if (!allowFailure) {
        console.warn(
          `[work-items-store] git ${args.join(" ")} failed in ${dir}; ` +
            `continuing without version history. ${(error as Error).message}`,
        );
      }
      return false;
    }
  }
}

/**
 * Resolve the roadmap store directory.
 *
 * Order: `SIGIL_ROADMAP_DIR` (or the explicit override) wins; otherwise a
 * co-located `sigil-roadmap` directory beside the main sigil repo — derived
 * PORTABLY from `git rev-parse --git-common-dir` (the main checkout's parent),
 * never a hardcoded home path.
 */
export function resolveRoadmapDir(
  envDir = process.env.SIGIL_ROADMAP_DIR,
  override?: string,
  startDirectory = process.cwd(),
): string {
  if (override && override.trim()) return resolve(override);
  if (envDir && envDir.trim()) return resolve(envDir);
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: startDirectory,
    })
      .toString()
      .trim();
    const commonAbs = resolve(startDirectory, common);
    const mainRoot = dirname(commonAbs);
    return join(dirname(mainRoot), "sigil-roadmap");
  } catch {
    return join(resolve(startDirectory), "sigil-roadmap");
  }
}

/** Reject ids that could escape the store directory. */
export function assertSafeStoryId(id: string): void {
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.includes("/") ||
    id.includes("\\") ||
    id.includes("\0") ||
    id.includes("..") ||
    id.startsWith("_") ||
    id.startsWith(".") ||
    id === "index" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)
  ) {
    throw new Error(`Unsafe story id for a filesystem store: ${JSON.stringify(id)}.`);
  }
}

// ---------------------------------------------------------------------------
// Markdown (de)serialization
// ---------------------------------------------------------------------------

function serializeStoryMarkdown(
  story: Story,
  comments: StoryComment[],
): string {
  const frontmatter: Record<string, unknown> = { id: story.id };
  if (story.worktree !== undefined) frontmatter.worktree = story.worktree;
  if (story.kind !== undefined) frontmatter.kind = story.kind;
  if (story.homeScopeId !== undefined) frontmatter.homeScopeId = story.homeScopeId;
  if (story.scopeBindings !== undefined)
    frontmatter.scopeBindings = story.scopeBindings;
  if (story.parentWorkItemId !== undefined)
    frontmatter.parentWorkItemId = story.parentWorkItemId;
  if (story.provenance !== undefined) frontmatter.provenance = story.provenance;
  if (story.revision !== undefined) frontmatter.revision = story.revision;
  frontmatter.epicId = story.epicId;
  frontmatter.epicTitle = story.epicTitle;
  frontmatter.title = story.title;
  frontmatter.status = story.status;
  frontmatter.routing = story.routing;
  frontmatter.reviewGate = story.reviewGate;
  frontmatter.deps = story.deps;
  if (story.extraction !== undefined) frontmatter.extraction = story.extraction;
  if (story.assignee !== undefined) frontmatter.assignee = story.assignee;
  if (story.assigneePrincipalId !== undefined)
    frontmatter.assigneePrincipalId = story.assigneePrincipalId;
  if (story.reviewDecision !== undefined)
    frontmatter.reviewDecision = story.reviewDecision;
  frontmatter.authoredBy = story.authoredBy;
  frontmatter.createdAt = story.createdAt;
  frontmatter.updatedAt = story.updatedAt;
  if (story.decidedBy !== undefined) frontmatter.decidedBy = story.decidedBy;
  if (story.decidedAt !== undefined) frontmatter.decidedAt = story.decidedAt;

  const criteria = story.acceptanceCriteria
    .map((criterion) => `- [ ] ${criterion}`)
    .join("\n");

  const commentsBlock =
    comments.length > 0
      ? `\`\`\`yaml\n${stringifyYaml(comments).trimEnd()}\n\`\`\``
      : "_No comments yet._";

  const body = [
    story.intent,
    "## Acceptance criteria",
    criteria,
    "## Comments",
    commentsBlock,
  ].join("\n\n");

  return `${serializeFrontmatter(frontmatter)}\n${body}\n`;
}

function parseStoryMarkdown(raw: string, fileName: string): Story {
  const { data, body } = parseFrontmatter(raw);
  const intent = intentOf(body);
  const acceptanceCriteria = parseCriteria(
    extractSection(body, "Acceptance criteria"),
  );
  const candidate: Record<string, unknown> = {
    ...data,
    intent,
    acceptanceCriteria,
  };
  if (!isStory(candidate))
    throw new Error(
      `Roadmap store is corrupt: ${fileName} is not a valid story markdown file.`,
    );
  return candidate;
}

function serializeReviews(reviews: ReviewItem[]): string {
  const list =
    reviews.length > 0
      ? reviews
          .map(
            (review) =>
              `- ${review.id} · ${review.storyId} · ${review.gate} · ` +
              `${review.completed ? (review.decision ?? "decided") : "open"}`,
          )
          .join("\n")
      : "_No review items yet._";
  return `${serializeFrontmatter({ reviews })}\n# Reviews\n\n${list}\n`;
}

function serializeBoardViews(boardViews: BoardView[]): string {
  const list =
    boardViews.length > 0
      ? boardViews.map((view) => `- ${view.id} · ${view.name}`).join("\n")
      : "_No saved board views yet._";
  return `${serializeFrontmatter({ boardViews })}\n# Board views\n\n${list}\n`;
}

function serializeIndex(document: WorkItemsDocument, generatedAt: string): string {
  const rows = sortStories(document.stories)
    .map(
      (story) =>
        `- ${story.id} · ${story.title} · ${story.status} · ` +
        `${story.worktree ?? "—"}`,
    )
    .join("\n");
  const frontmatter = { revision: document.revision, generatedAt };
  return `${serializeFrontmatter(frontmatter)}\n# Roadmap index\n\n${rows}\n`;
}

// ---------------------------------------------------------------------------
// Frontmatter + markdown-section helpers
// ---------------------------------------------------------------------------

function serializeFrontmatter(data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data).trimEnd()}\n---\n`;
}

function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const normalized = raw.replace(/^﻿/, "");
  if (!normalized.startsWith("---\n"))
    return { data: {}, body: normalized };
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: normalized };
  const yamlText = normalized.slice(4, end);
  const rest = normalized.slice(end + 4).replace(/^\n/, "");
  const parsed: unknown = yamlText.trim() === "" ? {} : parseYaml(yamlText);
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body: rest };
}

function bodyOf(raw: string): string {
  return parseFrontmatter(raw).body;
}

/** Text between the frontmatter and the first `## ` heading, trimmed. */
function intentOf(body: string): string {
  const lines = body.split("\n");
  const collected: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## ")) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

/** The text of a `## <heading>` section, up to the next `## ` or EOF. */
function extractSection(body: string, heading: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) break;
    collected.push(lines[index]);
  }
  return collected.join("\n").trim();
}

function parseCriteria(section: string): string[] {
  return section
    .split("\n")
    .map((line) => /^- \[[ xX]\] (.*)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1].trim())
    .filter((text) => text.length > 0);
}

function parseCommentsSection(section: string, storyId: string): StoryComment[] {
  const fence = /```(?:yaml)?\n([\s\S]*?)```/.exec(section);
  if (!fence) return [];
  const parsed: unknown = parseYaml(fence[1]);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((entry, index) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as { id?: unknown }).id !== "string"
    ) {
      throw new Error(
        `Roadmap store is corrupt: invalid comment ${index} on story ${storyId}.`,
      );
    }
    return { storyId, ...(entry as object) } as StoryComment;
  });
}
