import { describe, expect, it } from "vitest";

import { workItemKeys } from "./work-items";

describe("work-items query isolation", () => {
  it("keys addressed views by the authenticated viewer id", () => {
    expect(workItemKeys.addressed("principal-one")).not.toEqual(
      workItemKeys.addressed("principal-two"),
    );
  });

  it("keys saved boards and board queries by the authenticated viewer id", () => {
    expect(workItemKeys.boardViews("principal-one")).not.toEqual(
      workItemKeys.boardViews("principal-two"),
    );
    expect(workItemKeys.boardQuery("principal-one", "board-1")).not.toEqual(
      workItemKeys.boardQuery("principal-two", "board-1"),
    );
  });
});
