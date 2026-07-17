// Post-build step for the static SPA deploy.
//
// TanStack Start SPA mode prerenders the hydration shell as `_shell.html`.
// GitHub Pages serves `index.html` at a directory root and `404.html` for
// unknown paths. Since this is a client-hydrated SPA, the same shell answers
// every route — so we copy `_shell.html` to both. This makes `dist/client`
// directly deployable under the configured base with no rename step at deploy.

import { copyFile, access } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const clientDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "client")
const shell = join(clientDir, "_shell.html")

await access(shell) // throws if the shell wasn't produced — fail the build loudly

for (const name of ["index.html", "404.html"]) {
  await copyFile(shell, join(clientDir, name))
  console.log(`[finalize-spa] wrote dist/client/${name}`)
}
