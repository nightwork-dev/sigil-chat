import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Typeset } from "@workspace/ui/components/typeset";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Renders assistant/user markdown — links, images, tables, code, lists, quotes.
 *
 * Styling is the design system's `Typeset`: react-markdown parses the markdown
 * into ordinary elements and `Typeset` (the `.typeset` prose sheet) styles them,
 * so headings/lists/code/tables/blockquotes match the rest of the app with no
 * per-element styling here. The `compact` variant suits dense chat bubbles.
 *
 * Security: react-markdown does NOT render raw HTML (no `rehype-raw`), so any
 * HTML in the content is shown as text, not executed. Its default `urlTransform`
 * strips dangerous protocols (`javascript:`, etc.), so link/image URLs are safe
 * by construction; links additionally get `rel="noopener noreferrer nofollow"`.
 * GFM (tables, strikethrough, task lists, autolinks) via `remark-gfm`. The only
 * component overrides below are FUNCTIONAL (link target/rel, lazy images) — the
 * visual styling comes from `Typeset`, not from here.
 */
export function ChatMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <Typeset
      variant="compact"
      className={cn(
        "min-w-0 max-w-full break-words text-sm [overflow-wrap:anywhere]",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...props }) => (
            <a {...props} rel="noopener noreferrer nofollow" target="_blank" />
          ),
          img: ({ node: _n, ...props }) => (
            <img {...props} alt={props.alt ?? ""} loading="lazy" />
          ),
        }}
      >
        {content}
      </Markdown>
    </Typeset>
  );
}
