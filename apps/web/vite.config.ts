import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import { readRuntimeTopology } from "@workspace/runtime-env/topology"

// Local dev: load the repo-root .env so this process has GONK_MCP_KEY, matching
// apps/gonk and apps/agent. The attachment-upload server function runs in this
// vite/Nitro process and proxies to Gonk's authenticated /upload route, so it
// needs the key server-side. Single source of truth is the root .env (see the
// GONK_MCP_KEY note in CLAUDE.md); an explicit export still wins.
if (process.env.GONK_MCP_KEY === undefined) {
  const rootEnv = resolve(import.meta.dirname, "../../.env")
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)
}

const { eveOrigin, gonkMcpUrl } = readRuntimeTopology(process.env)
// Gonk's browser-facing origin (strip the /mcp path). The web app proxies
// gonk's public /img reads same-origin (see routeRules below) so the browser
// never crosses an origin for attachment bytes — gonk stays internal.
const gonkOrigin = new URL(gonkMcpUrl).origin

const config = defineConfig({
  server: {
    // Allow Tailscale-served preview (tailscale serve → this dev server).
    // Vite rejects non-localhost Host headers by default; .ts.net is the
    // tailnet's MagicDNS suffix, reachable only by tailnet members.
    allowedHosts: [".ts.net"],
  },
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
        // Gonk serves content-addressed image/attachment bytes at /img/**.
        // Proxy them same-origin so the browser fetches attachments from its
        // own origin (no CORS on gonk); gonk stays an internal service.
        "/img/**": {
          proxy: `${gonkOrigin}/img/**`,
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
