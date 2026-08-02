import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Multiple test files stage the overlay into the same shared
    // packages/chat-overlay/files directory (stageOverlay() rmSync+recreates
    // it). Running test files in parallel races that directory across
    // workers; keep file execution serialized so each file's stage/assert
    // cycle finishes before the next begins.
    fileParallelism: false,
  },
})
