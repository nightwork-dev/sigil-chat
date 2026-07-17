import { describe, expect, it } from "vitest";

import {
  passageDraftReducer,
  projectPassageDraft,
  type PassageDraftSource,
} from "./passage-draft";

describe("passage draft boundary", () => {
  it("preserves both a dirty local draft and a newer agent revision", () => {
    const original: PassageDraftSource = {
      passageId: "preflight",
      body: "Verify every active region.",
      revision: 12,
    };
    const localDraft = passageDraftReducer(null, {
      type: "edit",
      source: original,
      body: "Verify every active region before launch.",
    });
    const agentRevision: PassageDraftSource = {
      ...original,
      body: "Verify enrollment and bracket creation in every active region.",
      revision: 13,
    };

    expect(projectPassageDraft(localDraft, agentRevision)).toEqual({
      body: "Verify every active region before launch.",
      dirty: true,
      expectedBody: "Verify every active region.",
      expectedRevision: 12,
      conflict: {
        localBody: "Verify every active region before launch.",
        persistedBody:
          "Verify enrollment and bracket creation in every active region.",
        persistedRevision: 13,
      },
    });
  });

  it("adopts the latest persisted body only after the local draft is discarded", () => {
    const original: PassageDraftSource = {
      passageId: "rollback",
      body: "Record the rollback owner.",
      revision: 4,
    };
    const localDraft = passageDraftReducer(null, {
      type: "edit",
      source: original,
      body: "Record the rollback owner and approver.",
    });
    const latest = {
      ...original,
      body: "Record the rollback owner, approver, and revision.",
      revision: 5,
    };

    const discarded = passageDraftReducer(localDraft, { type: "discard" });
    expect(projectPassageDraft(discarded, latest)).toMatchObject({
      body: latest.body,
      dirty: false,
      conflict: null,
    });
  });
});
