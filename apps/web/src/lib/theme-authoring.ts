/**
 * Dev-only theme authoring — the "Save to source" capability.
 *
 * `saveThemeToSource` is a server function that runs the derivation for BOTH
 * modes server-side and writes the new theme into three committed source files
 * so it becomes a real built-in (selectable in the ThemePicker, forkable in the
 * studio). It is a LOCAL AUTHORING TOOL and MUST NEVER run in production:
 * the handler hard-refuses unless NODE_ENV !== "production". There is no
 * production write path here by design.
 */

import { createServerFn } from "@tanstack/react-start"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  derive,
  exportBlock,
  type VariantParams,
} from "@/lib/theme-derive"
import {
  validateThemeName,
  themeCssExists,
  upsertThemeCss,
  upsertThemeRegistration,
  upsertPreset,
  paramsLiteral,
} from "@/lib/theme-source-writer"

export interface SaveThemeInput {
  name: string
  params: VariantParams
  description?: string
}

export interface SaveThemeResult {
  name: string
  className: string
  darkBlock: string
  lightBlock: string
  updated: boolean
}

function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

const saveThemeFn = createServerFn({ method: "POST" })
  .validator((input: SaveThemeInput) => input)
  .handler(async ({ data }): Promise<SaveThemeResult> => {
    // ── HARD dev guard: never a production write path. ──
    if (process.env.NODE_ENV === "production") {
      throw new Error("Theme authoring is disabled in production.")
    }

    const { name, params, description } = data
    const check = validateThemeName(name)
    if (!check.ok) throw new Error(check.reason ?? "Invalid theme name")

    // Server-only imports — kept inside the handler so they never leak into the
    // client bundle.
    const { readFile, writeFile } = await import("node:fs/promises")
    const { resolve } = await import("node:path")

    const cssPath = resolve(process.cwd(), "src/styles/themes.css")
    const themeTsxPath = resolve(process.cwd(), "src/lib/theme.tsx")
    const deriveTsPath = resolve(process.cwd(), "src/lib/theme-derive.ts")

    const [cssText, themeTsx, deriveTs] = await Promise.all([
      readFile(cssPath, "utf8"),
      readFile(themeTsxPath, "utf8"),
      readFile(deriveTsPath, "utf8"),
    ])

    const updated = themeCssExists(cssText, name)

    const darkTokens = derive(params, "dark")
    const lightTokens = derive(params, "light")
    const darkBlock = exportBlock(name, darkTokens, "dark", params.signalHue)
    const lightBlock = exportBlock(name, lightTokens, "light", params.signalHue)

    const nextCss = upsertThemeCss(cssText, name, darkBlock, lightBlock)
    const nextThemeTsx = upsertThemeRegistration(themeTsx, {
      className: `theme-${name}`,
      label: titleCase(name),
      description: description || `Authored in Theme Studio`,
      signal: darkTokens.primary,
      void: darkTokens.background,
      paper: lightTokens.background,
    })
    const nextDeriveTs = upsertPreset(
      deriveTs,
      name,
      paramsLiteral({
        surfaceHue: params.surfaceHue,
        surfaceTemp: params.surfaceTemp,
        signalHue: params.signalHue,
        signalChroma: params.signalChroma,
        textWarmth: params.textWarmth,
        radius: params.radius,
        destructiveHue: params.destructiveHue,
      }),
    )

    await Promise.all([
      writeFile(cssPath, nextCss, "utf8"),
      writeFile(themeTsxPath, nextThemeTsx, "utf8"),
      writeFile(deriveTsPath, nextDeriveTs, "utf8"),
    ])

    return {
      name,
      className: `theme-${name}`,
      darkBlock,
      lightBlock,
      updated,
    }
  })

/** Mutation hook for the dev-only "Save to source" button. */
export function useSaveThemeToSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveThemeInput) => saveThemeFn({ data: input }),
    onSuccess: () => {
      // No server query to invalidate — the new theme is picked up on reload
      // (HMR rebuilds themes.css + theme.tsx). Kept for parity with the pattern.
      qc.invalidateQueries({ queryKey: ["themes"] })
    },
  })
}
