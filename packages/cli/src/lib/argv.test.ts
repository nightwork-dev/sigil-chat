import { describe, expect, it } from "vitest";

import { getBool, getString, getStrings, parseArgs } from "./argv";

describe("parseArgs", () => {
  it("parses long flags, negated flags, and positionals", () => {
    const parsed = parseArgs([
      "report.tsx",
      "--out",
      "report.html",
      "--no-inline",
    ]);

    expect(parsed.positional).toEqual(["report.tsx"]);
    expect(getString(parsed.flags, "out")).toBe("report.html");
    expect(getBool(parsed.flags, "inline", true)).toBe(false);
  });

  it("preserves repeated long flags", () => {
    const parsed = parseArgs(["--skill", "reader.md", "--skill=domain.md"]);

    expect(getStrings(parsed.flags, "skill")).toEqual([
      "reader.md",
      "domain.md",
    ]);
  });

  it("stops parsing after a double dash", () => {
    const parsed = parseArgs(["--strict", "--", "--literal", "file.tsx"]);

    expect(getBool(parsed.flags, "strict")).toBe(true);
    expect(parsed.positional).toEqual(["--literal", "file.tsx"]);
  });
});
