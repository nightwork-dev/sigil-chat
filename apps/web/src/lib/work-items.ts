import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type {
  ReviewDecision,
  ReviewGate,
  Story,
  StoryComment,
  StoryFilter,
  StoryStatus,
  WorkItemsMutationResult,
} from "@workspace/work-items-store/types";

const listStoriesFn = createServerFn({ method: "GET" })
  .validator((input?: { filter?: StoryFilter }) => input ?? {})
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    return workItemsRepository.list(data.filter);
  });

const listReviewsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { workItemsRepository } = await import("@workspace/work-items-store");
  const document = await workItemsRepository.get();
  return document.reviews;
});

const getStoryFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    const story = document.stories.find(
      (candidate) => candidate.id === data.id,
    );
    if (!story) throw new Error(`Unknown story id: ${data.id}.`);
    return story;
  });

const upsertStoryFn = createServerFn({ method: "POST" })
  .validator((input: { story: Story; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    return workItemsRepository.upsertStory(data.story, data.expectedRevision);
  });

const transitionStoryFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; status: StoryStatus; expectedRevision?: number }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    return workItemsRepository.transitionStory(
      data.id,
      data.status,
      data.expectedRevision,
    );
  });

const assignReviewFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      id: string;
      gate: ReviewGate;
      title?: string;
      summary?: string;
      expectedRevision?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    return workItemsRepository.assignReview(
      data.id,
      {
        assignee: "Owner",
        gate: data.gate,
        title: data.title,
        summary: data.summary,
      },
      data.expectedRevision,
    );
  });

const decideReviewFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      reviewId: string;
      decision: ReviewDecision;
      decidedBy?: string;
      expectedRevision?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    return workItemsRepository.decideReview(
      data.reviewId,
      data.decision,
      data.decidedBy ?? "Owner",
      data.expectedRevision,
    );
  });

const listStoryCommentsFn = createServerFn({ method: "GET" })
  .validator((input: { storyId: string }) => input)
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    return document.comments.filter(
      (comment) => comment.storyId === data.storyId,
    );
  });

const addCommentFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      storyId: string;
      kind: StoryComment["kind"];
      author: string;
      body: string;
      addressee?: string;
      parentCommentId?: string;
      expectedRevision?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    // id + createdAt are minted server-side so two devices can't collide and
    // the timestamp is authoritative.
    const comment: StoryComment = {
      id: crypto.randomUUID(),
      storyId: data.storyId,
      kind: data.kind,
      author: data.author,
      body: data.body,
      createdAt: new Date().toISOString(),
      ...(data.addressee ? { addressee: data.addressee } : {}),
      ...(data.parentCommentId
        ? { parentCommentId: data.parentCommentId }
        : {}),
    };
    return workItemsRepository.addComment(comment, data.expectedRevision);
  });

export const workItemKeys = {
  all: () => ["work-items"] as const,
  list: (filter?: StoryFilter) =>
    [...workItemKeys.all(), "list", filter ?? {}] as const,
  detail: (id: string) => [...workItemKeys.all(), id] as const,
  reviews: () => [...workItemKeys.all(), "reviews"] as const,
  comments: (storyId: string) =>
    [...workItemKeys.all(), storyId, "comments"] as const,
};

export function useStories(filter?: StoryFilter) {
  return useQuery({
    // Unfiltered board stays on the base key so mutation reconciliation
    // (reconcileWorkItems) updates it in place; filtered views get a sub-key.
    queryKey: filter ? workItemKeys.list(filter) : workItemKeys.all(),
    queryFn: () => listStoriesFn({ data: { filter } }),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    // Temporary cross-process recovery until resource revision notifications
    // are available. Current-browser writes reconcile immediately below.
    refetchInterval: 15_000,
  });
}

export function useReviews() {
  return useQuery({
    queryKey: workItemKeys.reviews(),
    queryFn: () => listReviewsFn(),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    // Same cross-process recovery cadence as the stories board; current-browser
    // writes reconcile immediately below.
    refetchInterval: 15_000,
  });
}

export function useStory(id: string | undefined) {
  return useQuery({
    queryKey: workItemKeys.detail(id ?? "none"),
    queryFn: () => getStoryFn({ data: { id: id ?? "" } }),
    enabled: Boolean(id),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useUpsertStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { story: Story; expectedRevision?: number }) =>
      upsertStoryFn({ data: input }),
    onSuccess: (result) => reconcileWorkItems(queryClient, result),
  });
}

export function useTransitionStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      status: StoryStatus;
      expectedRevision?: number;
    }) => transitionStoryFn({ data: input }),
    onSuccess: (result) => reconcileWorkItems(queryClient, result),
  });
}

export function useAssignReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      gate: ReviewGate;
      title?: string;
      summary?: string;
      expectedRevision?: number;
    }) => assignReviewFn({ data: input }),
    onSuccess: (result) => reconcileWorkItems(queryClient, result),
  });
}

export function useDecideReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      reviewId: string;
      decision: ReviewDecision;
      decidedBy?: string;
      expectedRevision?: number;
    }) => decideReviewFn({ data: input }),
    onSuccess: (result) => reconcileWorkItems(queryClient, result),
  });
}

export function useStoryComments(storyId: string | undefined) {
  return useQuery({
    queryKey: workItemKeys.comments(storyId ?? "none"),
    queryFn: () => listStoryCommentsFn({ data: { storyId: storyId ?? "" } }),
    enabled: Boolean(storyId),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      storyId: string;
      kind: StoryComment["kind"];
      author: string;
      body: string;
      addressee?: string;
      parentCommentId?: string;
      expectedRevision?: number;
    }) => addCommentFn({ data: input }),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: workItemKeys.comments(variables.storyId),
      });
      return reconcileWorkItems(queryClient, result);
    },
  });
}

function reconcileWorkItems(
  queryClient: QueryClient,
  result: WorkItemsMutationResult,
): Promise<void> {
  queryClient.setQueryData(workItemKeys.all(), result.document.stories);
  queryClient.setQueryData(workItemKeys.reviews(), result.document.reviews);
  const changedIds = new Set(result.changedIds);
  for (const story of result.document.stories) {
    const storyReviewChanged = result.document.reviews.some(
      (review) => review.storyId === story.id && changedIds.has(review.id),
    );
    if (changedIds.has(story.id) || storyReviewChanged) {
      queryClient.setQueryData(workItemKeys.detail(story.id), story);
    }
  }
  return queryClient.invalidateQueries({ queryKey: workItemKeys.all() });
}
