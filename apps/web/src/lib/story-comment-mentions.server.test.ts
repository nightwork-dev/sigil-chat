import { envelopeBody } from "@gonk/comms";
import { describe, expect, it } from "vitest";

import {
  createStoryCommentMentionEnvelope,
  selectMentionRecipient,
} from "./story-comment-mentions.server";

describe("story comment comms deposit", () => {
  it("builds a defer-only coordination message containing references only", () => {
    const envelope = createStoryCommentMentionEnvelope({
      reference: { storyId: "S1.7", commentId: "comment-42" },
      selector: "coordinator",
      recipientHost: "pi",
      viewer: {
        id: "principal-1",
        email: "owner@example.test",
        name: "Owner",
        role: "owner",
        username: "reviewer-one",
      },
    });

    expect(envelope.kind).toBe("coordination");
    expect(envelope.intent).toBe("for_context");
    expect(envelope.message.to.persona).toBe("coordinator");
    expect(envelope.message.to.host).toBe("pi");
    expect(envelopeBody(envelope)).toBe(
      JSON.stringify({
        storyRef: "story:S1.7",
        commentRef: "comment:comment-42",
      }),
    );
    expect(envelopeBody(envelope)).not.toContain("feedback body");
  });

  it("selects one newest matching live persona and never fans out", () => {
    const selected = selectMentionRecipient(
      [
        {
          sessionId: "older",
          persona: "analysis",
          host: "pi",
          scopeHome: "scope-home-older",
          cwd: "project",
          lastSeen: 1,
        },
        {
          sessionId: "newer",
          persona: "analysis",
          host: "claude",
          scopeHome: "scope-home-newer",
          cwd: "project",
          lastSeen: 2,
        },
        {
          sessionId: "other-role",
          persona: "strategist",
          host: "pi",
          scopeHome: "scope-home-other",
          cwd: "project",
          lastSeen: 3,
        },
      ],
      "analysis",
    );

    expect(selected?.sessionId).toBe("newer");
  });
});
