import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["agent/**/*.test.ts"],
    exclude: [".eve/**", "node_modules/**"],
  },
})
