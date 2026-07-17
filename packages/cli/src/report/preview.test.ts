import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyCompanionPreview, inspectPreview } from "./preview";

const fixture = join(import.meta.dirname, "__fixtures__/pixel.png");

describe("preview images", () => {
  it("validates a PNG and reads its dimensions", () => {
    expect(inspectPreview(fixture)).toMatchObject({
      mime: "image/png",
      width: 1,
      height: 1,
    });
  });

  it("copies an explicit companion preview", () => {
    const destination = join(
      mkdtempSync(join(tmpdir(), "sigil-preview-")),
      "report.preview.png",
    );
    copyCompanionPreview(fixture, destination);
    expect(readFileSync(destination)).toEqual(readFileSync(fixture));
  });

  it("rejects unsupported preview types", () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "sigil-preview-")),
      "preview.txt",
    );
    writeFileSync(path, "not an image");
    expect(() => inspectPreview(path)).toThrow(
      "Unsupported preview image type",
    );
  });
});
