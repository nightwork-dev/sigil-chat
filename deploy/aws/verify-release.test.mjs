import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { parseImageManifest } from "./verify-release.mjs";

const digest = "a".repeat(64);
const validManifest = ["EVE", "MIGRATE", "WEB"]
  .map(
    (target) =>
      `SIGIL_${target}_IMAGE=123456789012.dkr.ecr.us-west-2.amazonaws.com/sigil-chat-${target.toLowerCase()}@sha256:${digest}`,
  )
  .join("\n");
const shellVerifier = new URL("./verify-release.sh", import.meta.url).pathname;

function verifyWithShell(source) {
  const directory = mkdtempSync(join(tmpdir(), "sigil-verify-release-"));
  const manifest = join(directory, "sigil-images.env");
  writeFileSync(manifest, source);
  return spawnSync(shellVerifier, [manifest], { encoding: "utf8" });
}

test("accepts exactly three immutable production images", () => {
  assert.equal(Object.keys(parseImageManifest(validManifest)).length, 3);
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

test("host verifier enforces the same immutable manifest boundary without Node", () => {
  assert.equal(verifyWithShell(validManifest).status, 0);

  for (const invalidManifest of [
    validManifest.replace(`@sha256:${digest}`, ":latest"),
    validManifest.split("\n").slice(1).join("\n"),
    `${validManifest}\n${validManifest.split("\n")[0]}`,
    `${validManifest}\nSIGIL_OTHER_IMAGE=x`,
  ]) {
    assert.notEqual(verifyWithShell(invalidManifest).status, 0);
  }
});
