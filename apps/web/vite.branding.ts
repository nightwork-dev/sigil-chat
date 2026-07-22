import { basename, resolve } from "node:path"

import { resolveBranding, type BrandingEnvironment } from "./src/lib/branding"

export function brandingDefine(
  mode: string,
  environment: BrandingEnvironment = process.env,
) {
  const worktreeName = basename(resolve(import.meta.dirname, "../.."))
  return {
    __SIGIL_BRANDING__: JSON.stringify(
      resolveBranding(environment, {
        development: mode === "development",
        worktreeName,
      }),
    ),
  }
}
