import { defineConfig } from "vitest/config"
import viteTsConfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [viteTsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    include: [
      "src/lib/**/*.test.ts", "src/lib/**/*.test.tsx",
      "src/components/**/*.test.ts",
      "src/features/**/*.test.ts",
    ],
    environment: "node",
  },
})
