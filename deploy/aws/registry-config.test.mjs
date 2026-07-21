import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const npmrcUrl = new URL("../../.npmrc", import.meta.url)

test("production installs do not depend on a local package registry", async () => {
  const npmrc = await readFile(npmrcUrl, "utf8")

  assert.doesNotMatch(npmrc, /localhost|127\.0\.0\.1|:4873/)
})
