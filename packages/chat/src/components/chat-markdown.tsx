import { cn } from "@workspace/ui/lib/utils";
import { renderMarkdown } from "@workspace/chat/lib/markdown";

/**
 * Renders markdown content from an assistant message.
 *
 * Security: renderMarkdown() escapes ALL HTML entities (&, <, >) FIRST,
 * then applies regex formatting. No user/model content can inject HTML.
 * Only the controlled set of tags from the regex replacements appear.
 * See lib/markdown.ts for the full security model.
 *
 * For full markdown with syntax highlighting, replace renderMarkdown
 * with remark/rehype pipeline.
 */
export function ChatMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const html = renderMarkdown(content);
  return (
    <div
      className={cn(
        "min-w-0 max-w-full break-words text-sm leading-relaxed [overflow-wrap:anywhere]",
        "[&_strong]:font-semibold [&_em]:italic",
        "[&_li]:text-sm [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:font-mono [&_code]:break-all [&_code]:font-mono",
        className,
      )}
      // SECURITY: renderMarkdown escapes &, <, > before formatting.
      // All HTML entities are neutralized before any tags are produced.
      // See packages/chat/src/lib/markdown.ts for the escape-first model.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
