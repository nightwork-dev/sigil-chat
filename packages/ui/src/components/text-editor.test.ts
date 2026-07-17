import { describe, expect, it } from "vitest";

import { textEditorDocument } from "./text-editor";

describe("textEditorDocument", () => {
  it.each([
    ["alpha\nbeta", ["alpha", "hardBreak", "beta"]],
    ["alpha\n\nbeta", ["alpha", "hardBreak", "hardBreak", "beta"]],
    ["alpha\n", ["alpha", "hardBreak"]],
  ])("preserves line boundaries in %j", (value, expected) => {
    const document = textEditorDocument(value);
    const paragraph = document.content?.[0];
    const tokens = paragraph?.content?.map((node) =>
      node.type === "text" ? node.text : node.type,
    );
    expect(tokens).toEqual(expected);
  });
});
