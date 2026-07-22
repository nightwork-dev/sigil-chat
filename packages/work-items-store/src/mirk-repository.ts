import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { MarkdownStore } from "@mirk/store-markdown";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  addRequestEvidence,
  addComment,
  assertRevision,
  assignReview,
  decideReview,
  filterBoardViews,
  isBoardView,
  filterStories,
  filterRequests,
  isReviewItem,
  isWorkSponsorshipDecision,
  proposeFeatureRequest,
  recordSponsorshipDecision,
  isStory,
  storyValidationIssues,
  sortStories,
  transitionStory,
  upsertBoardView,
  upsertStory,
} from "./operations.js";
import { createWorkItemsDocument } from "./sample.js";
import type { WorkItemsRepository } from "./repository.js";
import { assertSafeStoryId, resolveRoadmapDir } from "./markdown-repository.js";
import type {
  BoardView,
  BoardViewFilter,
  AddRequestEvidenceInput,
  FeatureRequestProposalContext,
  FeatureRequestProposalInput,
  FeatureRequestProposalResult,
  RequestFilter,
  RequestInspectResult,
  RequestSearchResult,
  ReviewAssignment,
  ReviewDecision,
  ReviewItem,
  Story,
  StoryComment,
  StoryFilter,
  StoryStatus,
  WorkItemsDocument,
  WorkItemsMutationResult,
  WorkSponsorshipDecision,
  WorkSponsorshipDecisionFilter,
} from "./types.js";

const STORIES_COLLECTION = "stories";
const INDEX_FILE = "index.md";
const REVIEWS_FILE = "_reviews.md";
const BOARD_VIEWS_FILE = "_board-views.md";
const SPONSORSHIP_DECISIONS_FILE = "_sponsorship-decisions.md";
const GIT_IDENTITY = [
  "-c",
  "user.name=Sigil Roadmap",
  "-c",
  "user.email=roadmap@sigil.local",
];

type StoryRecord = Story & { comments: StoryComment[] };
type MutationResult = WorkItemsMutationResult & {
  commitMessage?: string;
  storyIds?: string[];
};

export interface MirkWorkItemsRepositoryOptions {
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
 * Work-items repository backed by Mirk's published MarkdownStore adapter.
 *
 * MarkdownStore owns story-file parsing, frontmatter/body section rendering,
 * atomic story writes, and the collection index projection. The roadmap's two
 * root sidecars (`index.md` with revision metadata and `_reviews.md`) are kept
 * in this thin domain wrapper because the published adapter does not yet have
 * sidecar-file or frontmatter-bearing-index configuration.
 */
export class MirkWorkItemsRepository implements WorkItemsRepository {
  private readonly dirOption?: string;
  private readonly now: () => string;
  private readonly gitEnabled: boolean;

  private resolvedDir?: string;
  private store?: MarkdownStore;
  private gitAvailable = false;
  private ready?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options?: MirkWorkItemsRepositoryOptions) {
    this.dirOption = options?.dir;
    this.now = options?.now ?? (() => new Date().toISOString());
    this.gitEnabled = options?.git ?? true;
  }

  /** The resolved store directory (available after the first operation). */
  get directory(): string {
    if (!this.resolvedDir)
      throw new Error("Mirk roadmap store is not initialized yet.");
    return this.resolvedDir;
  }

  async get(expectedRevision?: number): Promise<WorkItemsDocument> {
    await this.ensureReady();
    const document = await this.readDocument();
    assertRevision(document, expectedRevision);
    return structuredClone(document);
  }

  async list(filter?: StoryFilter): Promise<Story[]> {
    await this.ensureReady();
    const document = await this.readDocument();
    return filterStories(sortStories(document.stories), filter).map((story) =>
      structuredClone(story),
    );
  }

  async listBoardViews(filter?: BoardViewFilter): Promise<BoardView[]> {
    await this.ensureReady();
    return filterBoardViews((await this.readDocument()).boardViews, filter).map(
      (view) => structuredClone(view),
    );
  }

  async upsertStory(
    story: Story,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => ({
        ...upsertStory(document, story, expectedRevision),
        storyIds: [story.id],
      }),
      () => `story ${story.id}: upsert`,
    );
  }

  async upsertBoardView(
    view: BoardView,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => ({
        ...upsertBoardView(document, view, expectedRevision),
      }),
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
          commitMessage: `story ${id}: ${from}→${status}`,
          storyIds: [id],
        };
      },
      (result) => result.commitMessage ?? `story ${id}: →${status}`,
    );
  }

  async assignReview(
    id: string,
    assignment: ReviewAssignment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => ({
        ...assignReview(document, id, assignment, this.now, expectedRevision),
        storyIds: [id],
      }),
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
      (document) => {
        const review = document.reviews.find(({ id }) => id === reviewId);
        return {
          ...decideReview(
            document,
            reviewId,
            decision,
            decidedBy,
            this.now,
            expectedRevision,
          ),
          storyIds: review ? [review.storyId] : [],
        };
      },
      () => `review ${reviewId}: ${decision}`,
    );
  }

  async addComment(
    comment: StoryComment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => ({
        ...addComment(document, comment, expectedRevision),
        storyIds: [comment.storyId],
      }),
      () => `story ${comment.storyId}: comment ${comment.id}`,
    );
  }

  async proposeFeatureRequest(
    input: FeatureRequestProposalInput,
    context: FeatureRequestProposalContext,
    expectedRevision?: number,
  ): Promise<FeatureRequestProposalResult> {
    return this.runExclusive(async () => {
      await this.ensureReady();
      const result = proposeFeatureRequest(
        await this.readDocument(),
        input,
        context,
        expectedRevision,
      );
      if (result.changedIds.length > 0) {
        await this.persistDocument(result.document, result.changedIds);
        if (result.outcome === "created")
          this.commit(`feature request ${result.workItem.id}: propose`);
      }
      return structuredClone(result);
    });
  }

  async recordSponsorshipDecision(
    decision: WorkSponsorshipDecision,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) =>
        recordSponsorshipDecision(document, decision, expectedRevision),
      () => `sponsorship ${decision.id}: ${decision.decision}`,
    );
  }

  async listSponsorshipDecisions(
    filter?: WorkSponsorshipDecisionFilter,
  ): Promise<WorkSponsorshipDecision[]> {
    await this.ensureReady();
    return filterSponsorshipDecisions(
      (await this.readDocument()).sponsorshipDecisions,
      filter,
    );
  }

  async searchRequests(filter?: RequestFilter): Promise<RequestSearchResult> {
    await this.ensureReady();
    const document = await this.readDocument();
    return {
      revision: document.revision,
      requests: filterRequests(document.stories, filter),
    };
  }

  async inspectRequest(id: string): Promise<RequestInspectResult> {
    await this.ensureReady();
    const document = await this.readDocument();
    const request = filterRequests(document.stories).find(
      (candidate) => candidate.id === id,
    );
    if (!request) throw new Error(`Unknown request id: ${id}.`);
    return {
      revision: document.revision,
      request,
      sponsorshipDecisions: filterSponsorshipDecisions(
        document.sponsorshipDecisions,
        { workItemId: id },
      ),
    };
  }

  async addRequestEvidence(
    input: AddRequestEvidenceInput,
    context: FeatureRequestProposalContext,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate(
      (document) => ({
        ...addRequestEvidence(document, input, context),
        storyIds: [input.requestId],
      }),
      (result) => `request ${input.requestId}: evidence ${result.changedIds.at(-1) ?? "append"}`,
    );
  }

  private async mutate(
    operation: (document: WorkItemsDocument) => MutationResult,
    message: (result: MutationResult) => string,
  ): Promise<WorkItemsMutationResult> {
    return this.runExclusive(async () => {
      await this.ensureReady();
      const result = operation(await this.readDocument());
      if (result.changedIds.length > 0) {
        await this.persistDocument(result.document, result.storyIds);
        this.commit(message(result));
      }
      const {
        commitMessage: _commitMessage,
        storyIds: _storyIds,
        ...clean
      } = result;
      void _commitMessage;
      void _storyIds;
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
    const dir = resolveRoadmapDir(
      process.env.SIGIL_ROADMAP_DIR,
      this.dirOption,
    );
    this.resolvedDir = dir;
    await mkdir(dir, { recursive: true });

    this.store = new MarkdownStore({
      rootDir: dir,
      // The wrapper owns the single commit for the whole WorkItems mutation.
      // Mirk's per-put commit cannot include the roadmap sidecars atomically.
      git: false,
      collections: {
        [STORIES_COLLECTION]: {
          directory: ".",
          frontmatterFields: [
            "worktree",
            "kind",
            "homeScopeId",
            "scopeBindings",
            "parentWorkItemId",
            "provenance",
            "revision",
            "epicId",
            "epicTitle",
            "title",
            "status",
            "routing",
            "reviewGate",
            "deps",
            "extraction",
            "assignee",
            "assigneePrincipalId",
            "reviewDecision",
            "request",
            "authoredBy",
            "createdAt",
            "updatedAt",
            "decidedBy",
            "decidedAt",
          ],
          body: {
            preambleField: "intent",
            sections: {
              acceptanceCriteria: {
                heading: "Acceptance criteria",
                parse: parseCriteria,
                stringify: stringifyCriteria,
              },
              comments: {
                heading: "Comments",
                parse: parseCommentsMarkdown,
                stringify: stringifyComments,
              },
            },
          },
          index: {
            fileName: INDEX_FILE,
            heading: "Roadmap index",
            renderLine: renderIndexLine,
          },
        },
      },
    });

    if (this.gitEnabled) this.gitAvailable = this.initializeGit(dir);

    if ((await this.readStoryFiles()).length === 0) {
      const document = createWorkItemsDocument();
      await this.persistDocument(document);
      this.commit("roadmap: seed initial stories");
    } else {
      await this.repairIndexProjection();
    }
  }

  /**
   * `index.md` is a derived projection. Roadmap records may be added by another
   * worktree or harness without going through this process, so repair a stale
   * projection on open instead of presenting an incomplete roadmap index.
   */
  private async repairIndexProjection(): Promise<void> {
    const document = await this.readDocument();
    const path = join(this.directory, INDEX_FILE);
    const expectedRows = sortStories(document.stories).map(renderIndexLine);
    const currentRows = existsSync(path)
      ? (await readFile(path, "utf8"))
          .split("\n")
          .filter((line) => line.startsWith("- "))
      : [];
    if (
      currentRows.length === expectedRows.length &&
      currentRows.every((row, index) => row === expectedRows[index])
    )
      return;

    await writeFile(path, serializeIndex(document, this.now()), "utf8");
    this.commitIndexRepair();
  }

  private async readDocument(): Promise<WorkItemsDocument> {
    const storiesWithComments = await this.readStoryFiles();
    const stories = storiesWithComments.map(({ story }) => story);
    const comments = storiesWithComments.flatMap(({ comments }) => comments);
    return {
      revision: await this.readRevision(),
      stories: sortStories(stories),
      comments,
      reviews: await this.readReviews(),
      boardViews: await this.readBoardViews(),
      sponsorshipDecisions: await this.readSponsorshipDecisions(),
      history: [],
    };
  }

  private async readStoryFiles(): Promise<
    Array<{ story: Story; comments: StoryComment[] }>
  > {
    const store = this.requireStore();
    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch {
      return [];
    }

    const records: Array<{ story: Story; comments: StoryComment[] }> = [];
    for (const name of entries) {
      if (!name.endsWith(".md") || name === INDEX_FILE || name.startsWith("_"))
        continue;

      const id = name.slice(0, -3);
      const record = store.getById<StoryRecord>(STORIES_COLLECTION, id);
      if (record === null) continue;
      const { comments: rawComments = [], ...candidate } = record;
      // Idea/spec-stage stories legitimately have no "## Acceptance criteria"
      // section yet — the store yields undefined for the missing section.
      // Treat it as an empty list so they're valid stories, not corruption.
      if (!Array.isArray(candidate.acceptanceCriteria)) {
        candidate.acceptanceCriteria = [];
      }
      if (!isStory(candidate)) {
        // Resilience: one malformed story file must NOT take down the whole
        // board. Skip it with a loud warning; the rest of the
        // roadmap still loads.
        console.warn(
          `[work-items] Skipping ${name}: invalid ${storyValidationIssues(candidate).join(", ")}.`,
        );
        continue;
      }
      const comments = Array.isArray(rawComments)
        ? rawComments.map((comment, index) => {
            if (
              !comment ||
              typeof comment !== "object" ||
              typeof (comment as { id?: unknown }).id !== "string"
            ) {
              throw new Error(
                `Roadmap store is corrupt: invalid comment ${index} on story ${candidate.id}.`,
              );
            }
            return {
              storyId: candidate.id,
              ...(comment as object),
            } as StoryComment;
          })
        : [];
      records.push({ story: candidate, comments });
    }
    return records;
  }

  private async readReviews(): Promise<ReviewItem[]> {
    const path = join(this.directory, REVIEWS_FILE);
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

  private async readBoardViews(): Promise<BoardView[]> {
    const path = join(this.directory, BOARD_VIEWS_FILE);
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

  private async readSponsorshipDecisions(): Promise<WorkSponsorshipDecision[]> {
    const path = join(this.directory, SPONSORSHIP_DECISIONS_FILE);
    if (!existsSync(path)) return [];
    const { data } = parseFrontmatter(await readFile(path, "utf8"));
    const decisions = Array.isArray(data.sponsorshipDecisions)
      ? data.sponsorshipDecisions
      : [];
    return decisions.map((decision, index) => {
      if (!isWorkSponsorshipDecision(decision))
        throw new Error(
          `Roadmap store is corrupt: invalid sponsorship decision at ${SPONSORSHIP_DECISIONS_FILE}[${index}].`,
        );
      return decision;
    });
  }

  private async readRevision(): Promise<number> {
    const path = join(this.directory, INDEX_FILE);
    if (!existsSync(path)) return 0;
    const { data } = parseFrontmatter(await readFile(path, "utf8"));
    return typeof data.revision === "number" &&
      Number.isInteger(data.revision) &&
      data.revision >= 0
      ? data.revision
      : 0;
  }

  private async persistDocument(
    document: WorkItemsDocument,
    storyIds?: string[],
  ): Promise<void> {
    const store = this.requireStore();
    const commentsByStory = new Map<string, StoryComment[]>();
    for (const comment of document.comments) {
      const list = commentsByStory.get(comment.storyId) ?? [];
      list.push(comment);
      commentsByStory.set(comment.storyId, list);
    }

    const stories =
      storyIds === undefined
        ? document.stories
        : document.stories.filter((story) => storyIds.includes(story.id));

    await this.withSidecarsHidden(async () => {
      for (const story of stories) {
        assertSafeStoryId(story.id);
        const path = join(this.directory, `${story.id}.md`);
        const original = existsSync(path)
          ? await readFile(path, "utf8")
          : undefined;
        store.put<StoryRecord>(STORIES_COLLECTION, {
          ...recordForStory(story),
          comments: commentsByStory.get(story.id) ?? [],
        } as StoryRecord);
        if (original !== undefined)
          await restoreFrontmatterOrder(path, original);
      }
    });

    await writeFile(
      join(this.directory, REVIEWS_FILE),
      serializeReviews(document.reviews),
      "utf8",
    );
    await writeFile(
      join(this.directory, BOARD_VIEWS_FILE),
      serializeBoardViews(document.boardViews),
      "utf8",
    );
    await writeFile(
      join(this.directory, SPONSORSHIP_DECISIONS_FILE),
      serializeSponsorshipDecisions(document.sponsorshipDecisions),
      "utf8",
    );
    await writeFile(
      join(this.directory, INDEX_FILE),
      serializeIndex(document, this.now()),
      "utf8",
    );
  }

  private async withSidecarsHidden<T>(operation: () => Promise<T>): Promise<T> {
    const sources = [REVIEWS_FILE, BOARD_VIEWS_FILE, SPONSORSHIP_DECISIONS_FILE]
      .map((file) => join(this.directory, file))
      .filter(existsSync);
    if (sources.length === 0) return operation();
    const hidden = sources.map((_, index) =>
      join(this.directory, `.${index}.${process.pid}.${Date.now()}.tmp`),
    );
    await Promise.all(
      sources.map((source, index) => rename(source, hidden[index])),
    );
    try {
      return await operation();
    } finally {
      await Promise.all(
        hidden.map((path, index) => rename(path, sources[index])),
      );
    }
  }

  private initializeGit(dir: string): boolean {
    if (!existsSync(join(dir, ".git"))) return this.runGit(dir, ["init"]);
    return this.runGit(dir, ["rev-parse", "--git-dir"]);
  }

  private commit(message: string): void {
    if (!this.gitAvailable || !this.resolvedDir) return;
    const dir = this.resolvedDir;
    if (!this.runGit(dir, ["add", "-A"])) return;
    // `commit` exits non-zero when there is nothing staged; that is fine.
    this.runGit(dir, [...GIT_IDENTITY, "commit", "-m", message], true);
  }

  private commitIndexRepair(): void {
    if (!this.gitAvailable || !this.resolvedDir) return;
    const dir = this.resolvedDir;
    if (!this.runGit(dir, ["add", "--", INDEX_FILE])) return;
    this.runGit(
      dir,
      [...GIT_IDENTITY, "commit", "-m", "roadmap: repair index projection"],
      true,
    );
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

  private requireStore(): MarkdownStore {
    if (!this.store)
      throw new Error("Mirk roadmap store is not initialized yet.");
    return this.store;
  }
}

function recordForStory(story: Story): Record<string, unknown> {
  const record: Record<string, unknown> = { id: story.id };
  if (story.worktree !== undefined) record.worktree = story.worktree;
  record.kind = story.kind;
  record.homeScopeId = story.homeScopeId;
  record.scopeBindings = story.scopeBindings;
  if (story.parentWorkItemId !== undefined)
    record.parentWorkItemId = story.parentWorkItemId;
  record.provenance = story.provenance;
  record.revision = story.revision;
  record.epicId = story.epicId;
  record.epicTitle = story.epicTitle;
  record.title = story.title;
  record.status = story.status;
  record.routing = story.routing;
  record.reviewGate = story.reviewGate;
  record.deps = story.deps;
  if (story.assignee !== undefined) record.assignee = story.assignee;
  if (story.assigneePrincipalId !== undefined)
    record.assigneePrincipalId = story.assigneePrincipalId;
  if (story.reviewDecision !== undefined)
    record.reviewDecision = story.reviewDecision;
  if (story.extraction !== undefined) record.extraction = story.extraction;
  if (story.request !== undefined) record.request = story.request;
  record.authoredBy = story.authoredBy;
  record.createdAt = story.createdAt;
  record.updatedAt = story.updatedAt;
  if (story.decidedBy !== undefined) record.decidedBy = story.decidedBy;
  if (story.decidedAt !== undefined) record.decidedAt = story.decidedAt;
  record.intent = story.intent;
  record.acceptanceCriteria = story.acceptanceCriteria;
  return record;
}

function renderIndexLine(
  item: Readonly<Record<string, unknown>> | Story,
): string {
  return `- ${String(item.id)} · ${String(item.title)} · ${String(item.status)} · ${String(item.worktree ?? "—")}`;
}

function parseCriteria(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => /^- \[[ xX]\] (.*)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1].trim())
    .filter((text) => text.length > 0);
}

function stringifyCriteria(value: unknown): string {
  return (value as string[])
    .map((criterion) => `- [ ] ${criterion}`)
    .join("\n");
}

function parseCommentsMarkdown(markdown: string): unknown {
  const fence = /```(?:yaml)?\n([\s\S]*?)```/.exec(markdown);
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
        `Roadmap store contains an invalid comment at index ${index}.`,
      );
    }
    return entry;
  });
}

function stringifyComments(value: unknown): string {
  const comments = value as StoryComment[];
  if (comments.length === 0) return "_No comments yet._";
  const fence = String.fromCharCode(96).repeat(3);
  return `${fence}yaml\n${stringifyYaml(comments).trimEnd()}\n${fence}`;
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

function serializeSponsorshipDecisions(
  sponsorshipDecisions: WorkSponsorshipDecision[],
): string {
  const list =
    sponsorshipDecisions.length > 0
      ? sponsorshipDecisions
          .map(
            (decision) =>
              `- ${decision.id} · ${decision.workItemId} · ` +
              `${decision.sponsorPrincipalId} · ${decision.decision}`,
          )
          .join("\n")
      : "_No sponsorship decisions yet._";
  return `${serializeFrontmatter({ sponsorshipDecisions })}\n# Sponsorship decisions\n\n${list}\n`;
}

function filterSponsorshipDecisions(
  decisions: WorkSponsorshipDecision[],
  filter?: WorkSponsorshipDecisionFilter,
): WorkSponsorshipDecision[] {
  return decisions
    .filter(
      (decision) =>
        (filter?.workItemId === undefined ||
          decision.workItemId === filter.workItemId) &&
        (filter?.sponsorPrincipalId === undefined ||
          decision.sponsorPrincipalId === filter.sponsorPrincipalId),
    )
    .map((decision) => structuredClone(decision));
}

function serializeIndex(
  document: WorkItemsDocument,
  generatedAt: string,
): string {
  const rows = sortStories(document.stories)
    .map((story) => renderIndexLine(story))
    .join("\n");
  return `${serializeFrontmatter({ revision: document.revision, generatedAt })}\n# Roadmap index\n\n${rows}\n`;
}

function serializeFrontmatter(data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data).trimEnd()}\n---\n`;
}

function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const normalized = raw.replace(/^﻿/, "");
  if (!normalized.startsWith("---\n")) return { data: {}, body: normalized };
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

/**
 * MarkdownStore preserves values but may append an unconfigured legacy key
 * when it rewrites a record. Put that key back in its original frontmatter
 * position so touching one story cannot create unrelated format churn.
 */
async function restoreFrontmatterOrder(
  path: string,
  original: string,
): Promise<void> {
  const current = await readFile(path, "utf8");
  const originalParts = frontmatterParts(original);
  const currentParts = frontmatterParts(current);
  if (!originalParts || !currentParts) return;

  const originalBlocks = frontmatterBlocks(originalParts.yaml);
  const currentBlocks = frontmatterBlocks(currentParts.yaml);
  const currentByKey = new Map(
    currentBlocks.map((block) => [block.key, block.lines.join("\n")]),
  );
  const originalKeys = originalBlocks.map((block) => block.key);
  const orderedKeys = [
    ...originalKeys.filter((key) => currentByKey.has(key)),
    ...currentBlocks
      .map((block) => block.key)
      .filter((key) => !originalKeys.includes(key)),
  ];
  const yaml = orderedKeys
    .map((key) => currentByKey.get(key))
    .filter((block): block is string => block !== undefined)
    .join("\n");
  const reordered = `${current.slice(0, currentParts.start)}${yaml}${current.slice(currentParts.end)}`;
  if (reordered !== current) await writeFile(path, reordered, "utf8");
}

function frontmatterParts(
  raw: string,
): { start: number; end: number; yaml: string } | undefined {
  const normalized = raw.replace(/^﻿/, "");
  if (!normalized.startsWith("---\n")) return undefined;
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return undefined;
  return { start: 4, end, yaml: normalized.slice(4, end) };
}

function frontmatterBlocks(
  yaml: string,
): Array<{ key: string; lines: string[] }> {
  const blocks: Array<{ key: string; lines: string[] }> = [];
  for (const line of yaml.split("\n")) {
    const match = /^([^\s#:][^:]*):(?:\s|$)/.exec(line);
    if (match) {
      blocks.push({ key: match[1].trim(), lines: [line] });
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].lines.push(line);
    }
  }
  return blocks;
}
