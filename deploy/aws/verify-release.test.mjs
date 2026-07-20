import assert from "node:assert/strict";
import test from "node:test";

import { parseImageManifest } from "./verify-release.mjs";

const digest = "a".repeat(64);
const validManifest = ["EVE", "GONK", "MIGRATE", "WEB"]
  .map(
    (target) =>
      `SIGIL_${target}_IMAGE=ghcr.io/example/sigil-chat-${target.toLowerCase()}@sha256:${digest}`,
  )
  .join("\n");

test("accepts exactly four immutable production images", () => {
  assert.equal(Object.keys(parseImageManifest(validManifest)).length, 4);
});

test("rejects tags, missing images, duplicates, and unknown keys", () => {
  assert.throws(
    () =>
      parseImageManifest(validManifest.replace(`@sha256:${digest}`, ":latest")),
    /immutable/,
  );
  assert.throws(
    () => parseImageManifest(validManifest.split("\n").slice(1).join("\n")),
    /Missing/,
  );
  assert.throws(
    () =>
      parseImageManifest(`${validManifest}\n${validManifest.split("\n")[0]}`),
    /Duplicate/,
  );
  assert.throws(
    () => parseImageManifest(`${validManifest}\nSIGIL_OTHER_IMAGE=x`),
    /Unexpected/,
  );
});
