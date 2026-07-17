import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/lib/**/*.test.ts", "src/components/**/*.test.ts", "src/hooks/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
})
