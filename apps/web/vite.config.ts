import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import { readRuntimeTopology } from "@workspace/runtime-env/topology"

// Load the repo-root .env for all server-only configuration, including Gonk
// transport auth and Better Auth. process.loadEnvFile preserves explicitly
// exported values, so the root file remains the local default rather than an
// override.
const rootEnv = resolve(import.meta.dirname, "../../.env")
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

// Validate the topology at startup (fail fast on a malformed EVE_ORIGIN);
// the /eve/** proxy route reads it per-request from process.env.
readRuntimeTopology(process.env)
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
    tanstackStart(),
    nitro({
      serverDir: resolve(import.meta.dirname, "server"),
      // NOTE: /eve/** is proxied by an app-owned nitro route
      // (server/routes/eve/[...].ts), not a routeRules proxy — h3's routeRule
      // proxy 502s on POST /eve/v1/session in this stack (see the route's
      // header comment). eveOrigin is still read here so the client bundle
      // and server fn topology stay consistent.
      routeRules: {},
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
    viteReact(),
  ],
})

export default config
