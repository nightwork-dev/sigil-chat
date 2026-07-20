import { readFile } from "node:fs/promises"
import { basename } from "node:path"

import { collectToolOutcome, makeBaseContext } from "@gonk/tool-registry"

import { getSessionArtifactStore } from "../src/artifact-store.js"
import { createSigilRegistry } from "../src/registry.js"

const sourcePath = process.argv[2]
const instruction = process.argv.slice(3).join(" ").trim()
if (!sourcePath || !instruction) {
  throw new Error(
    "Usage: pnpm demo:image-edit <source-image> <instruction>",
  )
}

const scopeId = `image-edit-demo-${Date.now()}`
const artifacts = getSessionArtifactStore()
const source = await artifacts.putFile({
  bytes: new Uint8Array(await readFile(sourcePath)),
  filename: basename(sourcePath),
  mediaType: mediaTypeFor(sourcePath),
  scope: scopeId,
})
const outcome = await collectToolOutcome(
  createSigilRegistry().invoke(
    "sigil-edit-image",
    {
      sourceArtifactId: source.id,
      instruction,
      width: 512,
      height: 512,
    },
    makeBaseContext({ host: { sessionScope: scopeId }, env: process.env }),
  ),
)

console.log(
  JSON.stringify(
    {
      artifactRoot: process.env.SIGIL_ARTIFACT_DIR,
      scopeId,
      sourceArtifactId: source.id,
      outcome,
    },
    null,
    2,
  ),
)
if (!outcome.ok) process.exitCode = 1

function mediaTypeFor(path: string): string {
  const normalized = path.toLowerCase()
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (normalized.endsWith(".webp")) return "image/webp"
  return "image/png"
}
