import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { readPublicWebEnvironment } from "@workspace/runtime-env/topology"

const { pagesBase } = readPublicWebEnvironment(process.env)

// Static SPA build for GitHub Pages. Same as vite.config.ts but with Nitro
// dropped and SPA mode enabled — TanStack Start prerenders a static hydration
// shell (`_shell.html`) instead of running a server. `base` supports GH Pages'
// subpath serving (e.g. https://user.github.io/<repo>/) via the PAGES_BASE
// env var; defaults to "/" for local verification.
//
// Caveat: routes using `createServerFn` (e.g. src/routes/sidebar/index.tsx)
// will NOT work in this export — there is no server to run them against.
// SPA export is only valid for routes that don't rely on server functions.
const config = defineConfig({
  base: pagesBase,
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
})

export default config
