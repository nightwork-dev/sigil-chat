import { describe, expect, it } from "vitest";

import { splitPassages } from "../src/evidence.js";

describe("evidence passages", () => {
  it("keeps every quote anchored to exact text offsets and line locators", () => {
    const text = [
      "Opening line.",
      "",
      `${"evidence ".repeat(180)}terminal marker.`,
      "Closing line.",
    ].join("\n");
    const passages = splitPassages(text);

    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) {
      expect(
        text.slice(passage.locator.startOffset, passage.locator.endOffset),
      ).toBe(passage.quote);
      expect(passage.locator.endOffset).toBeGreaterThan(
        passage.locator.startOffset,
      );
      expect(passage.locator.endLine).toBeGreaterThanOrEqual(
        passage.locator.startLine,
      );
    }
  });
});
