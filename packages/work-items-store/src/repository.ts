import {
  JsonFileStore,
  resolveWorkspaceDataPath,
} from "@workspace/file-store-core";

import { MirkWorkItemsRepository } from "./mirk-repository.js";
import {
  addComment,
  assertRevision,
  assignReview,
  decideReview,
  filterStories,
  parseWorkItemsDocument,
  sortStories,
  transitionStory,
  upsertStory,
} from "./operations.js";
import { createWorkItemsDocument } from "./sample.js";
import type {
  ReviewAssignment,
  ReviewDecision,
  Story,
  StoryComment,
  StoryFilter,
  StoryStatus,
  WorkItemsDocument,
  WorkItemsMutationResult,
} from "./types.js";

export interface WorkItemsRepository {
  get(expectedRevision?: number): Promise<WorkItemsDocument>;
  list(filter?: StoryFilter): Promise<Story[]>;
  upsertStory(
    story: Story,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
  transitionStory(
    id: string,
    status: StoryStatus,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
  assignReview(
    id: string,
    assignment: ReviewAssignment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
  decideReview(
    reviewId: string,
    decision: ReviewDecision,
    decidedBy: string,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
  addComment(
    comment: StoryComment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult>;
}

export class MemoryWorkItemsRepository implements WorkItemsRepository {
  private document: WorkItemsDocument;
  private readonly now: () => string;

  constructor(options?: {
    document?: WorkItemsDocument;
    now?: () => string;
  }) {
    this.document = structuredClone(
      options?.document ?? createWorkItemsDocument(),
    );
    this.now = options?.now ?? (() => new Date().toISOString());
  }

  async get(expectedRevision?: number): Promise<WorkItemsDocument> {
    assertRevision(this.document, expectedRevision);
    return structuredClone(this.document);
  }

  async list(filter?: StoryFilter): Promise<Story[]> {
    return filterStories(sortStories(this.document.stories), filter).map(
      (story) => structuredClone(story),
    );
  }

  async upsertStory(
    story: Story,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = upsertStory(this.document, story, expectedRevision);
    this.document = result.document;
    return structuredClone(result);
  }

  async transitionStory(
    id: string,
    status: StoryStatus,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = transitionStory(
      this.document,
      id,
      status,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async assignReview(
    id: string,
    assignment: ReviewAssignment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = assignReview(
      this.document,
      id,
      assignment,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async decideReview(
    reviewId: string,
    decision: ReviewDecision,
    decidedBy: string,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = decideReview(
      this.document,
      reviewId,
      decision,
      decidedBy,
      this.now,
      expectedRevision,
    );
    this.document = result.document;
    return structuredClone(result);
  }

  async addComment(
    comment: StoryComment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    const result = addComment(this.document, comment, expectedRevision);
    this.document = result.document;
    return structuredClone(result);
  }
}

export class FileWorkItemsRepository implements WorkItemsRepository {
  private readonly store: JsonFileStore<WorkItemsDocument>;

  constructor(
    readonly filePath = resolveWorkItemsStorePath(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.store = new JsonFileStore({
      filePath,
      lockLabel: "work-items",
      createInitial: createWorkItemsDocument,
      parse: parseWorkItemsDocument,
      corruptError: (path) =>
        new Error(
          `Work-items store is corrupt at "${path}". Expected a work-items document with valid stories, comments, reviews, and history arrays.`,
        ),
    });
  }

  async get(expectedRevision?: number): Promise<WorkItemsDocument> {
    const document = await this.store.read();
    assertRevision(document, expectedRevision);
    return structuredClone(document);
  }

  async list(filter?: StoryFilter): Promise<Story[]> {
    const document = await this.store.read();
    return filterStories(sortStories(document.stories), filter).map((story) =>
      structuredClone(story),
    );
  }

  async upsertStory(
    story: Story,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      upsertStory(document, story, expectedRevision),
    );
  }

  async transitionStory(
    id: string,
    status: StoryStatus,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      transitionStory(document, id, status, this.now, expectedRevision),
    );
  }

  async assignReview(
    id: string,
    assignment: ReviewAssignment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      assignReview(document, id, assignment, this.now, expectedRevision),
    );
  }

  async decideReview(
    reviewId: string,
    decision: ReviewDecision,
    decidedBy: string,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      decideReview(
        document,
        reviewId,
        decision,
        decidedBy,
        this.now,
        expectedRevision,
      ),
    );
  }

  async addComment(
    comment: StoryComment,
    expectedRevision?: number,
  ): Promise<WorkItemsMutationResult> {
    return this.mutate((document) =>
      addComment(document, comment, expectedRevision),
    );
  }

  private async mutate(
    operation: (document: WorkItemsDocument) => WorkItemsMutationResult,
  ): Promise<WorkItemsMutationResult> {
    return this.store.withWriteLock(async () => {
      const result = operation(await this.store.read());
      if (result.changedIds.length > 0) await this.store.write(result.document);
      return structuredClone(result);
    });
  }
}

export { MarkdownWorkItemsRepository } from "./markdown-repository.js";
export { MirkWorkItemsRepository } from "./mirk-repository.js";

/**
 * Default repository used by the app. The roadmap is persisted through Mirk's
 * MarkdownStore adapter as one markdown file per story in an external,
 * co-located, self-versioned git repo. MarkdownWorkItemsRepository remains
 * exported as a one-line rollback backing.
 */
export const workItemsRepository: WorkItemsRepository =
  new MirkWorkItemsRepository();

export function resolveWorkItemsStorePath(
  startDirectory = process.cwd(),
): string {
  return resolveWorkspaceDataPath({
    relativePath: ".data/work-items.json",
    rootPackageName: "sigil-chat",
    startDirectory,
  });
}
