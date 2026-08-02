// The owner verification queue (VQ.1): which verify-status stories are
// waiting on a browser pass, where in the app each one is checked, and the
// two actions the owner takes in place.
//
// Deliberately thin. The stories come from the existing work-items read path
// (`useStories` in ./work-items.ts, keyed by the same factory), and the pass
// and the feedback ride the existing `useTransitionStory` / `useAddComment`
// mutations so every write still lands as a commit in the external roadmap
// repo. What lives here is the part neither of those owns: the server-side
// mount gate, the queue ordering, and the deep-link target.
//
// Structure mirrors ./feature-flags.ts — pure policy plus createServerFn
// wrappers, importable from client code, with the session and store reads
// behind a dynamic import in ./verification-queue.server.ts.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import type { Story } from "@workspace/work-items-store/types"

import { sanitizeReturnTo } from "./auth/return-to"
import { workItemKeys, useAddComment, useTransitionStory } from "./work-items"

/** The flag that mounts the overlay. Declared in ./feature-flags/registry.ts. */
export const VERIFICATION_QUEUE_FLAG = "dev.verificationQueue"

// ─── Policy (pure) ──────────────────────────────────────────────────────────

/** One row of the queue: a story to check, and where to go to check it. */
export interface VerificationQueueEntry {
  readonly story: Story
  /** Same-origin in-app path, search params intact. */
  readonly href: string
  /** The owner's checklist, or an empty list when the story authored none. */
  readonly steps: readonly string[]
  /** False when `href` fell back to the story's roadmap panel. */
  readonly targeted: boolean
}

/**
 * Where "take me there" goes.
 *
 * `verify.url` is authored by hand in a Markdown file, so it is a same-origin
 * candidate, not a trusted destination — it goes through the same guard the
 * login `returnTo` uses. A story with no block (or an off-origin one) falls
 * back to its own roadmap panel, which is always a real surface.
 */
export function verificationTarget(story: Story): string {
  const fallback = `/roadmap?story=${encodeURIComponent(story.id)}`
  return sanitizeReturnTo(story.verify?.url, fallback)
}

/**
 * The queue: verify-status stories, newest-first.
 *
 * Newest-first by `updatedAt` because the useful order for a browser pass is
 * "what did the agents just finish", not the board's id order. Ties fall back
 * to descending id so the order is total and the list never reshuffles between
 * renders of the same data.
 */
export function selectVerificationQueue(
  stories: readonly Story[],
): VerificationQueueEntry[] {
  return stories
    .filter((story) => story.status === "verify")
    .slice()
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.id.localeCompare(left.id, undefined, { numeric: true }),
    )
    .map((story) => ({
      story,
      href: verificationTarget(story),
      steps: story.verify?.steps ?? [],
      targeted: story.verify?.url !== undefined,
    }))
}

/** The comment body an owner pass appends, timestamped from the browser act. */
export function ownerPassComment(passedAt: string): string {
  return `Owner verification pass — checked off in the app from the verification queue overlay at ${passedAt}.`
}

// ─── Server fn ──────────────────────────────────────────────────────────────

/**
 * Whether the overlay mounts at all, decided on the server.
 *
 * Both halves of the answer are server-side facts the browser cannot assert
 * for itself: the principal's role comes from the session, and the flag comes
 * from the installation-settings store. The client receives one boolean and
 * has nothing to spoof its way past — hiding the surface is not the control,
 * this is.
 */
export const fetchVerificationQueueAccess = createServerFn({
  method: "GET",
}).handler(async (): Promise<{ enabled: boolean }> => ({
  enabled: await (
    await import("./verification-queue.server")
  ).readVerificationQueueAccess(),
}))

// ─── React Query ────────────────────────────────────────────────────────────

export const verificationQueueKeys = {
  all: () => ["verification-queue"] as const,
  access: () => ["verification-queue", "access"] as const,
}

export function useVerificationQueueAccess() {
  return useQuery({
    queryKey: verificationQueueKeys.access(),
    queryFn: () => fetchVerificationQueueAccess(),
    staleTime: 5_000,
  })
}

/**
 * Check a story off: shipped, plus an owner-pass comment.
 *
 * Transition first, comment second, and that order is load-bearing. Both
 * mutations reconcile the work-items cache on success; if the comment landed
 * first, its reconciliation would refetch the queue while the story was still
 * `verify` and pull the row the owner just dismissed straight back onto the
 * screen.
 */
export function useVerificationPass() {
  const queryClient = useQueryClient()
  const transitionStory = useTransitionStory()
  const addComment = useAddComment()

  return useMutation({
    mutationFn: async ({ storyId }: { storyId: string }) => {
      const result = await transitionStory.mutateAsync({
        id: storyId,
        status: "shipped",
      })
      await addComment.mutateAsync({
        storyId,
        kind: "approval",
        body: ownerPassComment(new Date().toISOString()),
      })
      return result
    },
    // Optimistic removal: the row leaves the queue on click, not on the round
    // trip through a git commit in another repository.
    onMutate: ({ storyId }) => {
      queryClient.setQueryData(
        workItemKeys.list({ status: "verify" }),
        (stories: Story[] | undefined) =>
          stories?.filter((story) => story.id !== storyId),
      )
    },
    // A refused or failed write must put the row back rather than leave the
    // owner believing a story shipped.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: workItemKeys.all() })
    },
  })
}
