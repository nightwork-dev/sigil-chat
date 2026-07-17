import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import "./typeset.css"

const typesetVariants = cva("typeset", {
  variants: {
    variant: {
      default: null,
      compact: "typeset-compact",
      reading: "typeset-reading",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

type TypesetProps = useRender.ComponentProps<"div"> & VariantProps<typeof typesetVariants>

/**
 * Applies theme-aware reading rhythm to semantic HTML produced by Markdown,
 * a CMS, or ordinary React children. It deliberately does not parse Markdown.
 */
function Typeset({ className, variant, render, ...props }: TypesetProps) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      { className: typesetVariants({ variant, className }) },
      props,
    ),
    render,
    state: { slot: "typeset", variant: variant ?? "default" },
  })
}

export { Typeset, typesetVariants }
export type { TypesetProps }
