import { resolveBranding, siteUrl } from "./branding"

import type { BrandingConfig } from "./branding"

declare const __SIGIL_BRANDING__: BrandingConfig | undefined

export const SITE =
  typeof __SIGIL_BRANDING__ === "undefined"
    ? resolveBranding({}, { development: false })
    : __SIGIL_BRANDING__

export function canonicalSiteUrl(pathname = "/") {
  return siteUrl(SITE, pathname)
}
