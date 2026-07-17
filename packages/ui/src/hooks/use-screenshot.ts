import { useState } from "react"
import { toPng } from "html-to-image"

// Simplified from the source's screenshot hook — the source's crop/round
// logic padded the canvas up to the
// nearest multiple of a `round` px grid (default 64) and stretched the
// captured image slightly to fill that padding, apparently for a texture-
// atlas/thumbnail-grid use case this repo doesn't have. Cut entirely:
// "export-to-image for cards/diagrams" (the actual gap this fills) just
// needs a real, undistorted capture of a DOM node.
//
// Built on `html-to-image`, not the source's `html2canvas`: html2canvas
// re-implements CSS parsing itself and throws on Tailwind v4's oklab()
// color functions (used by every color utility with an opacity modifier —
// i.e. nearly everything in this design system) — confirmed live, it threw
// on the very first realistically-styled element tried. html-to-image
// renders through an SVG <foreignObject>, so it supports whatever CSS the
// browser itself renders, oklab included.

export interface ScreenshotOptions {
  /** Resolution multiplier — passed to html-to-image's `pixelRatio` (default: 1). */
  scale?: number
}

export function useScreenshot({ scale = 1 }: ScreenshotOptions = {}) {
  const [image, setImage] = useState<string | null>(null)

  async function takeScreenshot(node: HTMLElement) {
    // skipFonts: true — html-to-image otherwise tries to inline this app's
    // Google Fonts stylesheet by reading its CSSStyleSheet.cssRules, which
    // the browser blocks cross-origin (a SecurityError logged to console
    // on every capture even though it doesn't fail the capture itself).
    // The captured image falls back to a system font instead of DM Sans/
    // JetBrains Mono, a reasonable trade-off for a debugging/sharing
    // screenshot utility.
    const dataUrl = await toPng(node, { pixelRatio: scale, skipFonts: true })
    setImage(dataUrl)
    return dataUrl
  }

  return { image, takeScreenshot }
}
