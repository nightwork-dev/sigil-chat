import { describe, expect, it } from "vitest";

import { workItemKeys } from "./work-items";

describe("work-items query isolation", () => {
  it("keys addressed views by the authenticated viewer id", () => {
    expect(workItemKeys.addressed("principal-one")).not.toEqual(
      workItemKeys.addressed("principal-two"),
    );
  });
});
