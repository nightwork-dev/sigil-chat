import type {
  Story,
  StoryComment,
} from "@workspace/work-items-store/types";

const INLINE_SELECTOR_PATTERN =
  /(?<![a-z0-9._-])@([a-z0-9][a-z0-9._-]{0,31})(?![a-z0-9._-])/gi;
const VALID_SELECTOR_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/;

export interface StoryCommentViewerIdentity {
  role: "owner" | "member";
  username: string | null;
}

/**
 * Parse one app-level persona selector. Repeated uses of the same selector
 * still resolve to one target; distinct selectors deliberately do not route.
 * The selector vocabulary is open, but its syntax matches mention handles.
 */
export function parseSingleInlineSelector(body: string): string | undefined {
  const selectors = new Set<string>();
  for (const match of body.matchAll(INLINE_SELECTOR_PATTERN)) {
    const selector = match[1]!.replace(/[._-]+$/, "").toLowerCase();
    if (VALID_SELECTOR_PATTERN.test(selector)) selectors.add(selector);
  }
  return selectors.size === 1 ? selectors.values().next().value : undefined;
}

export function viewerCommentSelectors(
  viewer: StoryCommentViewerIdentity,
): ReadonlySet<string> {
  const selectors = new Set<string>([viewer.role]);
  const username = viewer.username?.trim().toLowerCase();
  if (username) selectors.add(username);
  return selectors;
}

export function storiesAddressedToViewer(
  stories: readonly Story[],
  comments: readonly StoryComment[],
  viewer: StoryCommentViewerIdentity,
): Story[] {
  const selectors = viewerCommentSelectors(viewer);
  const storyIds = new Set(
    comments
      .filter((comment) => {
        const addressee = comment.addressee?.trim().toLowerCase();
        if (addressee && selectors.has(addressee)) return true;
        const inline = parseSingleInlineSelector(comment.body);
        return inline !== undefined && selectors.has(inline);
      })
      .map((comment) => comment.storyId),
  );
  return stories.filter((story) => storyIds.has(story.id));
}
