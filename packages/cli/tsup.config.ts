import { readFileSync } from "node:fs"

import { defineConfig } from "tsup"

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string }

// The Sigil CLI ships compiled JS (Node 20+ LTS has no native TS), so we test
// the same artifact users run. ESM-only, node20 target for broad compat.
export default defineConfig({
  entry: {
    sigil: "src/bin/sigil.ts",
    "create-sigil": "src/bin/create-sigil.ts",
    report: "src/report/define-report.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: true,
  define: {
    __SIGIL_VERSION__: JSON.stringify(packageJson.version),
  },
})
