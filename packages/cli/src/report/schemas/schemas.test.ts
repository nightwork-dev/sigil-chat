import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function schema(name: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, name), "utf-8"));
}

describe("published schemas", () => {
  it("pins advisory trust in report skills", () => {
    const manifest = schema("sigil-report-manifest.schema.json");
    expect(manifest.$defs.advisorySkill.required).toContain("trust");
    expect(manifest.$defs.advisorySkill.properties.trust.const).toBe(
      "advisory",
    );
  });

  it("requires the template fields used by the scaffolder", () => {
    const template = schema("sigil-template.schema.json");
    expect(template.required).toEqual(
      expect.arrayContaining(["name", "defaultPackageManager", "exclude"]),
    );
    expect(template.properties.rewrite.items.oneOf).toHaveLength(2);
  });
});
