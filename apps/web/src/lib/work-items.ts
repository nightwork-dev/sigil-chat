import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { useAgentPrincipalId } from "@/lib/agent-principal";
import type {
  BoardQueryResult,
  BoardTraversal,
  BoardView,
  BoardViewFilter,
  ReviewDecision,
  ReviewGate,
  Story,
  StoryComment,
  StoryFilter,
  StoryStatus,
  WorkItemsMutationResult,
  WorkSponsorshipDecision,
} from "@workspace/work-items-store/types";
import { queryBoardView } from "@workspace/work-items-store/operations";

const listStoriesFn = createServerFn({ method: "GET" })
  .validator(
    (input?: { filter?: StoryFilter; addressedToMe?: boolean }) => input ?? {},
  )
  .handler(async ({ data }) => {
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    );
    const viewer = authenticatedWorkItemsViewer(await getSession());
    const stories = await workItemsRepository.list(data.filter);
    if (!data.addressedToMe) return stories;

    const { storiesAddressedToViewer } = await import(
      "@/lib/story-comment-mentions"
    );
    const document = await workItemsRepository.get();
    return storiesAddressedToViewer(stories, document.comments, {
      role: viewer.role,
      username: viewer.username,
    });
  });

const listReviewsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getSession } = await import("@/lib/auth/session");
  const { authenticatedWorkItemsViewer } = await import(
    "@/lib/work-items-viewer.server"
  );
  authenticatedWorkItemsViewer(await getSession());
  const { workItemsRepository } = await import("@workspace/work-items-store");
  const document = await workItemsRepository.get();
  return document.reviews;
});

const getStoryFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    );
    authenticatedWorkItemsViewer(await getSession());
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    const story = document.stories.find(
      (candidate) => candidate.id === data.id,
    );
    if (!story) throw new Error(`Unknown story id: ${data.id}.`);
    return story;
  });

const listBoardViewsFn = createServerFn({ method: "GET" })
  .validator((input?: { filter?: BoardViewFilter }) => input ?? {})
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer, boardViewsVisibleToViewer } =
      await import("@/lib/work-items-viewer.server");
    const viewer = authenticatedWorkItemsViewer(await getSession());
    const { workItemsRepository } = await import("@workspace/work-items-store");
    return boardViewsVisibleToViewer(
      await workItemsRepository.listBoardViews(data.filter),
      viewer,
    );
  });

const getBoardViewFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer, boardViewVisibleToViewer } =
      await import("@/lib/work-items-viewer.server");
    const viewer = authenticatedWorkItemsViewer(await getSession());
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    return boardViewVisibleToViewer(
      document.boardViews.find((view) => view.id === data.id),
      viewer,
    );
  });

const queryBoardViewFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<BoardQueryResult> => {
    const { getSession } = await import("@/lib/auth/session");
    const { createBoardTraversalResolver } =
      await import("@/lib/work-items-access.server");
    const { authenticatedWorkItemsViewer, boardViewVisibleToViewer } =
      await import("@/lib/work-items-viewer.server");
    const viewer = authenticatedWorkItemsViewer(await getSession());
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    const view = boardViewVisibleToViewer(
      document.boardViews.find((candidate) => candidate.id === data.id),
      viewer,
    );
    return queryBoardView(
      document.stories,
      view,
      createBoardTraversalResolver(viewer.id),
    );
  });

const queryScopeWorkFn = createServerFn({ method: "GET" })
  .validator((input: { scopeId: string; traversal: BoardTraversal }) => input)
  .handler(async ({ data }): Promise<BoardQueryResult> => {
    const { getSession } = await import("@/lib/auth/session");
    const { createBoardTraversalResolver, currentWorkItemsScopeAccess } =
      await import("@/lib/work-items-access.server");
    const { authenticatedWorkItemsViewer } =
      await import("@/lib/work-items-viewer.server");
    const viewer = authenticatedWorkItemsViewer(await getSession());
    const access = currentWorkItemsScopeAccess();
    if (
      !access.canAccess({
        principalId: viewer.id,
        scopeId: data.scopeId,
        action: "board.read",
      })
    ) {
      throw new Error("Scoped work was not found.");
    }
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    const view: BoardView = {
      id: `scope-home:${data.scopeId}`,
      ownerScopeId: data.scopeId,
      ownerPrincipalId: viewer.id,
      name: "Scope home",
      visibility: "private",
      roots: [data.scopeId],
      traversal: data.traversal,
      filters: {},
      groupBy: "status",
      revision: 0,
    };
    return queryBoardView(
      document.stories,
      view,
      createBoardTraversalResolver(viewer.id, access),
    );
  });

const listSessionCommitmentsFn = createServerFn({ method: "GET" })
  .validator((input: { threadId: string }) => input)
  .handler(async ({ data }): Promise<Story[]> => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer } =
      await import("@/lib/work-items-viewer.server");
    const viewer = authenticatedWorkItemsViewer(await getSession());
    const { agentThreadRepository } =
      await import("@/lib/agent-threads.server");
    if (!agentThreadRepository.get(viewer.id, data.threadId)) {
      throw new Error("Agent session was not found.");
    }
    const { currentWorkItemsScopeAccess, visibleSessionCommitments } =
      await import("@/lib/work-items-access.server");
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    return visibleSessionCommitments(
      document.stories,
      data.threadId,
      viewer.id,
      currentWorkItemsScopeAccess(),
    );
  });

const upsertBoardViewFn = createServerFn({ method: "POST" })
  .validator((input: { view: BoardView; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer, boardViewVisibleToViewer } =
      await import("@/lib/work-items-viewer.server");
    const { prepareBoardViewForUpsert, requireBoardViewMutationAccess } =
      await import("@/lib/work-items-access.server");
    const session = await getSession();
    const viewer = authenticatedWorkItemsViewer(session);
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    const existing = document.boardViews.find(
      (candidate) => candidate.id === data.view.id,
    );
    if (existing) boardViewVisibleToViewer(existing, viewer);
    const view = prepareBoardViewForUpsert(data.view, viewer.id, existing);
    requireBoardViewMutationAccess(session, view, undefined, existing);
    return workItemsRepository.upsertBoardView(
      view,
      data.expectedRevision,
    );
  });

const upsertStoryFn = createServerFn({ method: "POST" })
  .validator((input: { story: Story; expectedRevision?: number }) => input)
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { requireWorkItemsMutationAccess } = await import(
      "@/lib/work-items-access.server"
    );
    requireWorkItemsMutationAccess(await getSession());
    const { workItemsRepository } = await import("@workspace/work-items-store");
    return workItemsRepository.upsertStory(data.story, data.expectedRevision);
  });

const transitionStoryFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; status: StoryStatus; expectedRevision?: number }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { requireWorkItemsMutationAccess } = await import(
      "@/lib/work-items-access.server"
    );
    requireWorkItemsMutationAccess(await getSession());
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
    const { getSession } = await import("@/lib/auth/session");
    const { requireWorkItemsMutationAccess } = await import(
      "@/lib/work-items-access.server"
    );
    requireWorkItemsMutationAccess(await getSession());
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
    const { getSession } = await import("@/lib/auth/session");
    const { requireWorkItemsMutationAccess } = await import(
      "@/lib/work-items-access.server"
    );
    requireWorkItemsMutationAccess(await getSession());
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
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    );
    authenticatedWorkItemsViewer(await getSession());
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
      body: string;
      addressee?: string;
      parentCommentId?: string;
      expectedRevision?: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    );
    const session = await getSession();
    const viewer = authenticatedWorkItemsViewer(session);
    const { workItemsRepository } = await import("@workspace/work-items-store");
    // id + createdAt are minted server-side so two devices can't collide and
    // the timestamp is authoritative.
    const comment: StoryComment = {
      id: crypto.randomUUID(),
      storyId: data.storyId,
      kind: data.kind,
      author: viewer.role === "owner" ? "Owner" : "Member",
      body: data.body,
      createdAt: new Date().toISOString(),
      ...(data.addressee ? { addressee: data.addressee } : {}),
      ...(data.parentCommentId
        ? { parentCommentId: data.parentCommentId }
        : {}),
    };
    const result = await workItemsRepository.addComment(
      comment,
      data.expectedRevision,
    );

    const { parseSingleInlineSelector } = await import(
      "@/lib/story-comment-mentions"
    );
    const selector = parseSingleInlineSelector(comment.body);
    if (selector) {
      try {
        const { depositStoryCommentMention } = await import(
          "@/lib/story-comment-mentions.server"
        );
        await depositStoryCommentMention({
          reference: { storyId: comment.storyId, commentId: comment.id },
          selector,
          viewer,
        });
      } catch {
        // The durable domain comment is authoritative. A missing/unavailable
        // harness inbox must not turn a successful write into a duplicate retry.
      }
    }
    return result;
  });

const listSponsorshipDecisionsFn = createServerFn({ method: "GET" })
  .validator((input: { workItemId: string }) => input)
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { authenticatedWorkItemsViewer } = await import(
      "@/lib/work-items-viewer.server"
    );
    const viewer = authenticatedWorkItemsViewer(await getSession());
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    const workItem = document.stories.find(
      (candidate) => candidate.id === data.workItemId,
    );
    if (!workItem) throw new Error("Feature request was not found.");
    const proposedSponsor = workItem.provenance?.proposedSponsorPrincipalId;
    if (proposedSponsor !== viewer.id) return [];
    return workItemsRepository.listSponsorshipDecisions({
      workItemId: workItem.id,
      sponsorPrincipalId: viewer.id,
    });
  });

const decideSponsorshipFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      workItemId: string;
      decision: WorkSponsorshipDecision["decision"];
    }) => input,
  )
  .handler(async ({ data }) => {
    const { getSession } = await import("@/lib/auth/session");
    const { requireSponsorshipDecisionAccess } = await import(
      "@/lib/work-items-access.server"
    );
    const session = await getSession();
    const { workItemsRepository } = await import("@workspace/work-items-store");
    const document = await workItemsRepository.get();
    const workItem = document.stories.find(
      (candidate) => candidate.id === data.workItemId,
    );
    if (!workItem) throw new Error("Feature request was not found.");
    const sponsor = requireSponsorshipDecisionAccess(session, workItem).user.id;
    const prior = document.sponsorshipDecisions.filter(
      (candidate) =>
        candidate.workItemId === workItem.id &&
        candidate.sponsorPrincipalId === sponsor,
    );
    const decision: WorkSponsorshipDecision = {
      id: crypto.randomUUID(),
      workItemId: workItem.id,
      sponsorPrincipalId: sponsor,
      decision: data.decision,
      decidedByPrincipalId: sponsor,
      decidedAt: new Date().toISOString(),
      revision:
        prior.reduce((max, candidate) => Math.max(max, candidate.revision), 0) +
        1,
    };
    return workItemsRepository.recordSponsorshipDecision(
      decision,
      document.revision,
    );
  });

export const workItemKeys = {
  all: () => ["work-items"] as const,
  list: (filter?: StoryFilter) =>
    [...workItemKeys.all(), "list", filter ?? {}] as const,
  detail: (id: string) => [...workItemKeys.all(), id] as const,
  reviews: () => [...workItemKeys.all(), "reviews"] as const,
  comments: (storyId: string) =>
    [...workItemKeys.all(), storyId, "comments"] as const,
  sponsorship: (storyId: string, viewerId: string) =>
    [...workItemKeys.all(), storyId, "sponsorship", viewerId] as const,
  addressed: (viewerId: string, filter?: StoryFilter) =>
    [...workItemKeys.all(), "addressed", viewerId, filter ?? {}] as const,
  boardViews: (viewerId: string, filter?: BoardViewFilter) =>
    [...workItemKeys.all(), "board-views", viewerId, filter ?? {}] as const,
  boardView: (viewerId: string, id: string) =>
    [...workItemKeys.all(), "board-view", viewerId, id] as const,
  boardQuery: (viewerId: string, id: string) =>
    [...workItemKeys.all(), "board-query", viewerId, id] as const,
  scopeQuery: (viewerId: string, scopeId: string, traversal: BoardTraversal) =>
    [
      ...workItemKeys.all(),
      "scope-query",
      viewerId,
      scopeId,
      traversal,
    ] as const,
  sessionCommitments: (viewerId: string, threadId: string) =>
    [...workItemKeys.all(), "session-commitments", viewerId, threadId] as const,
};

export function useStories(
  filter?: StoryFilter,
  addressedTo?: { viewerId: string; enabled: boolean },
) {
  return useQuery({
    // Unfiltered board stays on the base key so mutation reconciliation
    // (reconcileWorkItems) updates it in place; filtered views get a sub-key.
    queryKey: addressedTo
      ? workItemKeys.addressed(addressedTo.viewerId, filter)
      : filter
        ? workItemKeys.list(filter)
        : workItemKeys.all(),
    queryFn: () =>
      listStoriesFn({
        data: { filter, addressedToMe: addressedTo !== undefined },
      }),
    enabled: addressedTo?.enabled ?? true,
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

export function useBoardViews(filter?: BoardViewFilter) {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: workItemKeys.boardViews(principalId, filter),
    queryFn: () => listBoardViewsFn({ data: { filter } }),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useBoardView(id: string | undefined) {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: workItemKeys.boardView(principalId, id ?? "none"),
    queryFn: () => getBoardViewFn({ data: { id: id ?? "" } }),
    enabled: Boolean(id),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useBoardViewQuery(id: string | undefined) {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: workItemKeys.boardQuery(principalId, id ?? "none"),
    queryFn: () => queryBoardViewFn({ data: { id: id ?? "" } }),
    enabled: Boolean(id),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useScopeWork(
  scopeId: string,
  traversal: BoardTraversal,
  enabled = true,
) {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: workItemKeys.scopeQuery(principalId, scopeId, traversal),
    queryFn: () => queryScopeWorkFn({ data: { scopeId, traversal } }),
    enabled: enabled && scopeId.length > 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useSessionCommitments(threadId: string, enabled = true) {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: workItemKeys.sessionCommitments(principalId, threadId),
    queryFn: () => listSessionCommitmentsFn({ data: { threadId } }),
    enabled: enabled && threadId.length > 0,
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

export function useUpsertBoardView() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: { view: BoardView; expectedRevision?: number }) =>
      upsertBoardViewFn({ data: input }),
    onSuccess: (result, variables) =>
      reconcileBoardViews(queryClient, principalId, variables.view.id, result),
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

export function useSponsorshipDecisions(workItemId: string | undefined) {
  const principalId = useAgentPrincipalId();
  return useQuery({
    queryKey: workItemKeys.sponsorship(workItemId ?? "none", principalId),
    queryFn: () =>
      listSponsorshipDecisionsFn({ data: { workItemId: workItemId ?? "" } }),
    enabled: Boolean(workItemId),
  });
}

export function useDecideSponsorship() {
  const queryClient = useQueryClient();
  const principalId = useAgentPrincipalId();
  return useMutation({
    mutationFn: (input: {
      workItemId: string;
      decision: WorkSponsorshipDecision["decision"];
    }) => decideSponsorshipFn({ data: input }),
    onSuccess: (result, variables) => {
      queryClient.setQueryData(
        workItemKeys.sponsorship(variables.workItemId, principalId),
        result.document.sponsorshipDecisions.filter(
          (candidate) =>
            candidate.workItemId === variables.workItemId &&
            candidate.sponsorPrincipalId === principalId,
        ),
      );
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

function reconcileBoardViews(
  queryClient: QueryClient,
  principalId: string,
  viewId: string,
  result: WorkItemsMutationResult,
): Promise<void> {
  const view = result.document.boardViews.find(
    (candidate) => candidate.id === viewId,
  );
  if (view) {
    queryClient.setQueryData(
      workItemKeys.boardView(principalId, view.id),
      view,
    );
  }
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: [...workItemKeys.all(), "board-views", principalId],
    }),
    queryClient.invalidateQueries({
      queryKey: workItemKeys.boardView(principalId, viewId),
    }),
    queryClient.invalidateQueries({
      queryKey: workItemKeys.boardQuery(principalId, viewId),
    }),
  ]).then(() => undefined);
}
