import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type {
  ReviewAcceptanceInput,
  ReviewAnnotation,
  ReviewAnnotationKind,
  ReviewDocument,
  ReviewPassageEdit,
  ReviewUpdateResult,
} from "@workspace/review-store/types";

export const REVIEW_DOCUMENT_ID = "weekly-tournament-liveops";

const getReviewDocumentFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { reviewRepository } = await import("@workspace/review-store");
    return reviewRepository.get();
  },
);

const updateReviewPassagesFn = createServerFn({ method: "POST" })
  .validator(
    (input: { passages: ReviewPassageEdit[]; expectedRevision?: number }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { reviewRepository } = await import("@workspace/review-store");
    return reviewRepository.updatePassages(
      data.passages,
      data.expectedRevision,
    );
  });

const addReviewAnnotationsFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      annotations: Array<
        Pick<ReviewAnnotation, "passageIds" | "kind" | "body" | "author">
      >;
      expectedRevision?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { reviewRepository } = await import("@workspace/review-store");
    return reviewRepository.addAnnotations(
      data.annotations,
      data.expectedRevision,
    );
  });

const resolveReviewAnnotationFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      resolution: "dismissed" | "converted";
      resolutionNote: string;
      expectedRevision?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { reviewRepository } = await import("@workspace/review-store");
    return reviewRepository.resolveAnnotation(
      data.id,
      data.resolution,
      data.resolutionNote,
      data.expectedRevision,
    );
  });

const lockReviewDecisionFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { reviewRepository } = await import("@workspace/review-store");
    return reviewRepository.lockDecision(data.id, data.expectedRevision);
  });

const setReviewAcceptanceCheckFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; checked: boolean; expectedRevision?: number }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { reviewRepository } = await import("@workspace/review-store");
    return reviewRepository.setAcceptanceCheck(
      data.id,
      data.checked,
      data.expectedRevision,
    );
  });

const acceptReviewRevisionFn = createServerFn({ method: "POST" })
  .validator(
    (input: ReviewAcceptanceInput & { expectedRevision?: number }) => input,
  )
  .handler(async ({ data }) => {
    const { reviewRepository } = await import("@workspace/review-store");
    const { expectedRevision, ...acceptance } = data;
    return reviewRepository.acceptRevision(acceptance, expectedRevision);
  });

export const reviewDocumentKeys = {
  all: () => ["review-documents"] as const,
  detail: (id: string) => [...reviewDocumentKeys.all(), id] as const,
};

export function useReviewDocument() {
  return useQuery({
    queryKey: reviewDocumentKeys.detail(REVIEW_DOCUMENT_ID),
    queryFn: () => getReviewDocumentFn(),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    // Temporary cross-process recovery until resource revision notifications
    // are available. Current-browser writes reconcile immediately below.
    refetchInterval: 15_000,
  });
}

function setReviewDocument(queryClient: QueryClient, document: ReviewDocument) {
  queryClient.setQueryData(reviewDocumentKeys.detail(document.id), document);
}

export function useUpdateReviewPassages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      passages: ReviewPassageEdit[];
      expectedRevision?: number;
    }) => updateReviewPassagesFn({ data: input }),
    onSuccess: (result: ReviewUpdateResult) => {
      setReviewDocument(queryClient, result.document);
    },
  });
}

export function useAddReviewAnnotations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      passageIds: string[];
      kind: ReviewAnnotationKind;
      body: string;
      expectedRevision?: number;
    }) =>
      addReviewAnnotationsFn({
        data: {
          annotations: [
            {
              passageIds: input.passageIds,
              kind: input.kind,
              body: input.body,
              author: "human",
            },
          ],
          expectedRevision: input.expectedRevision,
        },
      }),
    onSuccess: ({ document }) => setReviewDocument(queryClient, document),
  });
}

export function useResolveReviewAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      resolution: "dismissed" | "converted";
      resolutionNote: string;
      expectedRevision?: number;
    }) => resolveReviewAnnotationFn({ data: input }),
    onSuccess: ({ document }) => setReviewDocument(queryClient, document),
  });
}

export function useLockReviewDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; expectedRevision?: number }) =>
      lockReviewDecisionFn({ data: input }),
    onSuccess: ({ document }) => setReviewDocument(queryClient, document),
  });
}

export function useSetReviewAcceptanceCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      checked: boolean;
      expectedRevision?: number;
    }) => setReviewAcceptanceCheckFn({ data: input }),
    onSuccess: ({ document }) => setReviewDocument(queryClient, document),
  });
}

export function useAcceptReviewRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: ReviewAcceptanceInput & { expectedRevision?: number },
    ) => acceptReviewRevisionFn({ data: input }),
    onSuccess: ({ document }) => setReviewDocument(queryClient, document),
  });
}

export function useInvalidateReviewDocument() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: reviewDocumentKeys.detail(REVIEW_DOCUMENT_ID),
      }),
    [queryClient],
  );
}
