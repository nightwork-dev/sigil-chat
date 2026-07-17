import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import { readRuntimeTopology } from "@workspace/runtime-env/topology"

const { eveOrigin } = readRuntimeTopology(process.env)

const config = defineConfig({
  esbuild: {
    // Published Sigil packages intentionally ship typed source. Ensure Vite's
    // dependency transform uses React's automatic JSX runtime for that TSX too.
    jsx: "automatic",
  },
  plugins: [
    nitro({
      routeRules: {
        "/eve/**": {
          proxy: `${eveOrigin}/eve/**`,
        },
      },
    }),
    viteTsConfigPaths({
      // Load the ui package's tsconfig too: the portable Layouts/Views/Blocks
      // live in @workspace/ui and are consumed as source, so files there must
      // get the package's own path mappings (e.g. @workspace/chat|data used by
      // the chat/entity-browser Views). Without this, Rollup can't resolve
      // those sibling-package imports from files under packages/ui.
      projects: ["./tsconfig.json", "../../packages/ui/tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
