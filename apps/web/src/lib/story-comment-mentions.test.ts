import { describe, expect, it } from "vitest";
import type { Story, StoryComment } from "@workspace/work-items-store/types";

import {
  parseSingleInlineSelector,
  storiesAddressedToViewer,
} from "./story-comment-mentions";

const stories = [
  { id: "S1", title: "One" },
  { id: "S2", title: "Two" },
  { id: "S3", title: "Three" },
] as Story[];

describe("story comment selectors", () => {
  it("accepts public role terms and open validated handles", () => {
    expect(parseSingleInlineSelector("Please check this, @coordinator."))
      .toBe("coordinator");
    expect(parseSingleInlineSelector("For @review-agent_2 when available"))
      .toBe("review-agent_2");
    expect(parseSingleInlineSelector("For @review.agent when available"))
      .toBe("review.agent");
  });

  it("does not route email addresses or distinct multi-target mentions", () => {
    expect(parseSingleInlineSelector("mail person@example.test"))
      .toBeUndefined();
    expect(parseSingleInlineSelector("@coordinator and @analysis"))
      .toBeUndefined();
    expect(parseSingleInlineSelector("@analysis, then @analysis"))
      .toBe("analysis");
  });

  it("filters by the authenticated viewer role and username only", () => {
    const comments = [
      {
        id: "C1",
        storyId: "S1",
        addressee: "owner",
        body: "Role-directed",
      },
      {
        id: "C2",
        storyId: "S2",
        body: "Please inspect, @reviewer-one.",
      },
      {
        id: "C3",
        storyId: "S3",
        body: "Please inspect, @reviewer-two.",
      },
    ] as StoryComment[];

    expect(
      storiesAddressedToViewer(stories, comments, {
        role: "owner",
        username: "reviewer-one",
      }).map((story) => story.id),
    ).toEqual(["S1", "S2"]);
    expect(
      storiesAddressedToViewer(stories, comments, {
        role: "member",
        username: "reviewer-two",
      }).map((story) => story.id),
    ).toEqual(["S3"]);
  });
});
