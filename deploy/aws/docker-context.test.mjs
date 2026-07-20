import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(new URL("../../", import.meta.url).pathname);

test("every local Dockerfile COPY source exists in a clean checkout", () => {
  const dockerfile = readFileSync(
    resolve(repositoryRoot, "Dockerfile"),
    "utf8",
  );
  const missing = [];

  for (const line of dockerfile.split("\n")) {
    if (!line.startsWith("COPY ") || line.startsWith("COPY --from=")) continue;
    const sources = line.split(/\s+/).slice(1, -1);
    for (const source of sources) {
      if (!existsSync(resolve(repositoryRoot, source))) missing.push(source);
    }
  }

  assert.deepEqual(missing, []);
});

test("Docker build context excludes local state and coordination material", () => {
  const ignore = readFileSync(resolve(repositoryRoot, ".dockerignore"), "utf8");
  for (const entry of [
    ".git",
    ".data",
    "**/.eve",
    "**/node_modules",
    "docs.local",
    "*.local",
  ]) {
    assert.match(ignore, new RegExp(`^${entry.replaceAll("*", "\\*")}$`, "m"));
  }
});
