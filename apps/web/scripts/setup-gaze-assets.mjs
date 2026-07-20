import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const publicDirectory = resolve(scriptDirectory, "../public")
const modelDirectory = join(publicDirectory, "models")
const wasmTargetDirectory = join(publicDirectory, "mediapipe/wasm")
const models = [
  {
    filename: "face_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
  {
    filename: "hand_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
]

const bundlePath = require.resolve("@mediapipe/tasks-vision")
const packageDirectory = dirname(bundlePath)
const wasmSourceDirectory = join(packageDirectory, "wasm")

await mkdir(modelDirectory, { recursive: true })
await mkdir(wasmTargetDirectory, { recursive: true })

for (const filename of await readdir(wasmSourceDirectory)) {
  await copyFile(
    join(wasmSourceDirectory, filename),
    join(wasmTargetDirectory, filename),
  )
}

for (const model of models) {
  const modelPath = join(modelDirectory, model.filename)
  let modelExists = false
  try {
    modelExists = (await stat(modelPath)).size > 0
  } catch {
    modelExists = false
  }

  if (!modelExists) {
    const response = await fetch(model.url)
    if (!response.ok) {
      throw new Error(
        `Could not download MediaPipe ${model.filename} (${response.status} ${response.statusText}).`,
      )
    }
    await writeFile(modelPath, new Uint8Array(await response.arrayBuffer()))
  }
}

console.log(
  "Vision assets ready in apps/web/public (runtime network not required).",
)
