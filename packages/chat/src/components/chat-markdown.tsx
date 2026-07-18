import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@workspace/ui/lib/utils";

/**
 * Renders assistant/user markdown — links, images, tables, code, lists, quotes.
 *
 * Security: react-markdown does NOT render raw HTML (no `rehype-raw`), so any
 * HTML in the content is shown as text, not executed. Its default `urlTransform`
 * strips dangerous protocols (`javascript:`, etc.), so link/image URLs are safe
 * by construction; links additionally get `rel="noopener noreferrer nofollow"`.
 * GFM (tables, strikethrough, task lists, autolinks) via `remark-gfm`.
 */
export function ChatMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full break-words text-sm leading-relaxed [overflow-wrap:anywhere]",
        "[&_strong]:font-semibold [&_em]:italic",
        "[&>*+*]:mt-3 [&_ul_ul]:mt-1 [&_ol_ol]:mt-1",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...props }) => (
            <a
              {...props}
              className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
              rel="noopener noreferrer nofollow"
              target="_blank"
            />
          ),
          img: ({ node: _n, ...props }) => (
            <img
              {...props}
              alt={props.alt ?? ""}
              className="my-2 max-h-96 max-w-full rounded-md border border-border object-contain"
              loading="lazy"
            />
          ),
          ul: ({ node: _n, ...props }) => (
            <ul {...props} className="list-disc pl-5" />
          ),
          ol: ({ node: _n, ...props }) => (
            <ol {...props} className="list-decimal pl-5" />
          ),
          code: ({ node: _n, className: codeClass, ...props }) =>
            /language-/.test(codeClass ?? "") ? (
              <code
                {...props}
                className={cn("font-mono text-[13px]", codeClass)}
              />
            ) : (
              <code
                {...props}
                className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]"
              />
            ),
          pre: ({ node: _n, ...props }) => (
            <pre
              {...props}
              className="max-w-full overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-[13px] leading-normal"
            />
          ),
          blockquote: ({ node: _n, ...props }) => (
            <blockquote
              {...props}
              className="border-l-2 border-border pl-3 text-muted-foreground italic"
            />
          ),
          table: ({ node: _n, ...props }) => (
            <div className="max-w-full overflow-x-auto">
              <table {...props} className="w-full border-collapse text-sm" />
            </div>
          ),
          th: ({ node: _n, ...props }) => (
            <th
              {...props}
              className="border border-border px-2 py-1 text-left font-semibold"
            />
          ),
          td: ({ node: _n, ...props }) => (
            <td {...props} className="border border-border px-2 py-1 align-top" />
          ),
          h1: ({ node: _n, ...props }) => (
            <h1 {...props} className="text-base font-semibold" />
          ),
          h2: ({ node: _n, ...props }) => (
            <h2 {...props} className="text-base font-semibold" />
          ),
          h3: ({ node: _n, ...props }) => (
            <h3 {...props} className="text-sm font-semibold" />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
