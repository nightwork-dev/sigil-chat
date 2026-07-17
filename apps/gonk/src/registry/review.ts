import { shape, type ToolRegistry } from "@gonk/tool-registry";
import {
  MemoryReviewRepository,
  type ReviewRepository,
} from "@workspace/review-store";

import {
  emptyObjectSchema,
  objectSchema,
  readHints,
  reviewItemsSchema,
  writeHints,
} from "./schemas.js";
import {
  type AddReviewAnnotationsInput,
  type ReviewItemsInput,
  type ReviewPassagesInput,
  type UpdateReviewPassagesInput,
  isAddReviewAnnotationsInput,
  isEmptyObject,
  isReviewAnnotationItemsInput,
  isReviewDecisionItemsInput,
  isReviewPassagesInput,
  isUpdateReviewPassagesInput,
} from "./validators.js";

export function registerReviewTools(
  registry: ToolRegistry,
  reviews: ReviewRepository,
): void {
  registry.register({
    name: "sigil-review-inspect",
    description:
      "Inspect the complete draft article review document, including its ordered outline, all passages, decisions, and annotations.",
    visibility: "always",
    approval: "read",
    input: shape<Record<string, never>>(
      isEmptyObject,
      "Expected an empty object.",
    ),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async () => ({ data: await reviews.get() }),
  });

  registry.register({
    name: "sigil-review-passages",
    description:
      "Read one or more review passages by stable id, optionally including a bounded number of adjacent passages before and after each selection.",
    visibility: "always",
    approval: "read",
    input: shape<ReviewPassagesInput>(
      isReviewPassagesInput,
      "Expected a non-empty ids array and optional non-negative integer before and after counts.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
        },
        before: { type: "integer", minimum: 0, maximum: 10 },
        after: { type: "integer", minimum: 0, maximum: 10 },
      },
      required: ["ids"],
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input: ReviewPassagesInput) => {
      const document = await reviews.get();
      const indexes = input.ids.map((id) =>
        document.passages.findIndex((passage) => passage.id === id),
      );
      const missingIds = input.ids.filter((_, index) => indexes[index] === -1);
      if (missingIds.length > 0) {
        throw new Error(`Unknown passage ids: ${missingIds.join(", ")}.`);
      }
      const selectedIndexes = new Set<number>();
      for (const index of indexes) {
        for (
          let adjacentIndex = Math.max(0, index - (input.before ?? 0));
          adjacentIndex <=
          Math.min(document.passages.length - 1, index + (input.after ?? 0));
          adjacentIndex += 1
        ) {
          selectedIndexes.add(adjacentIndex);
        }
      }
      return {
        data: {
          documentId: document.id,
          revision: document.revision,
          requestedIds: input.ids,
          passages: [...selectedIndexes]
            .sort((left, right) => left - right)
            .map((index) => document.passages[index]),
        },
      };
    },
  });

  registry.register({
    name: "sigil-review-decisions",
    description:
      "List review decisions, optionally filtered by decision ids, selected passage ids, or status.",
    visibility: "always",
    approval: "read",
    input: shape<ReviewItemsInput>(
      isReviewDecisionItemsInput,
      "Expected optional ids, passageIds, and open or locked status filters.",
    ),
    inputJsonSchema: reviewItemsSchema(["open", "locked"]),
    hints: readHints,
    handler: async (input) => ({
      data: {
        decisions: filterReviewItems((await reviews.get()).decisions, input),
      },
    }),
  });

  registry.register({
    name: "sigil-review-annotations",
    description:
      "List review annotations with their full text, optionally filtered by annotation ids, selected passage ids, or status.",
    visibility: "always",
    approval: "read",
    input: shape<ReviewItemsInput>(
      isReviewAnnotationItemsInput,
      "Expected optional ids, passageIds, and open or resolved status filters.",
    ),
    inputJsonSchema: reviewItemsSchema(["open", "resolved"]),
    hints: readHints,
    handler: async (input) => ({
      data: {
        annotations: filterReviewItems(
          (await reviews.get()).annotations,
          input,
        ),
      },
    }),
  });

  registry.register({
    name: "sigil-review-update-passages",
    description:
      "Atomically replace the text of one or more review passages. Supply expectedBody when editing text previously inspected so stale edits fail instead of overwriting newer work.",
    visibility: "always",
    approval: "write",
    input: shape<UpdateReviewPassagesInput>(
      isUpdateReviewPassagesInput,
      "Expected a non-empty passages array with stable ids, body text, and optional expectedBody conflict guards.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        passages: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: objectSchema(
            {
              id: { type: "string", minLength: 1 },
              body: { type: "string" },
              expectedBody: { type: "string" },
            },
            ["id", "body"],
          ),
        },
        expectedRevision: { type: "integer", minimum: 0 },
      },
      required: ["passages"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input: UpdateReviewPassagesInput) => {
      const result = await reviews.updatePassages(
        input.passages,
        input.expectedRevision,
      );
      if (!result.applied) {
        return { data: result };
      }
      return {
        data: {
          applied: true,
          revision: result.document.revision,
          passages: result.passages,
          clientCommand: {
            type: "agent.domain.outcome",
            payload: {
              id: `review:passages.update:${result.document.revision}`,
              kind: "review.document.changed",
              resource: {
                kind: "review-document",
                id: result.document.id,
                revision: result.document.revision,
              },
              operation: "passages.update",
              changedIds: result.passages.map(({ id }) => id),
            },
          },
        },
      };
    },
  });

  registry.register({
    name: "sigil-review-add-annotation",
    description:
      "Attach one or more agent-authored annotations to one or more review passages in a single request.",
    visibility: "always",
    approval: "write",
    input: shape<AddReviewAnnotationsInput>(
      isAddReviewAnnotationsInput,
      "Expected a non-empty annotations array with passageIds, kind, and body.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        annotations: {
          type: "array",
          minItems: 1,
          items: objectSchema(
            {
              id: { type: "string", minLength: 1 },
              passageIds: {
                type: "array",
                minItems: 1,
                uniqueItems: true,
                items: { type: "string", minLength: 1 },
              },
              kind: {
                type: "string",
                enum: ["note", "flag", "question", "approval"],
              },
              body: { type: "string", minLength: 1 },
              author: { type: "string", minLength: 1 },
            },
            ["passageIds", "kind", "body"],
          ),
        },
      },
      required: ["annotations"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input: AddReviewAnnotationsInput) => {
      const result = await reviews.addAnnotations(
        input.annotations.map((annotation) => ({
          ...annotation,
          author: annotation.author ?? "agent",
        })),
      );
      return {
        data: {
          annotations: result.annotations,
          revision: result.document.revision,
          clientCommand: {
            type: "agent.domain.outcome",
            payload: {
              id: `review:annotations.add:${result.document.revision}:${result.annotations
                .map(({ id }) => id)
                .join(",")}`,
              kind: "review.document.changed",
              resource: {
                kind: "review-document",
                id: result.document.id,
                revision: result.document.revision,
              },
              operation: "annotations.add",
              changedIds: result.annotations.map(({ id }) => id),
            },
          },
        },
      };
    },
  });
}

export function createReviewDemoRepository(options?: {
  now?: () => string;
}): ReviewRepository {
  return new MemoryReviewRepository({ now: options?.now });
}

function filterReviewItems<
  T extends { id: string; passageIds: string[]; status: string },
>(items: T[], input: ReviewItemsInput): T[] {
  const ids = input.ids ? new Set(input.ids) : undefined;
  const passageIds = input.passageIds ? new Set(input.passageIds) : undefined;
  return items.filter(
    (item) =>
      (!ids || ids.has(item.id)) &&
      (!passageIds ||
        item.passageIds.some((passageId) => passageIds.has(passageId))) &&
      (input.status === undefined || item.status === input.status),
  );
}
