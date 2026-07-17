/**
 * Safe markdown-to-HTML renderer for chat messages.
 *
 * Security model: ALL HTML entities are escaped FIRST (&, <, >), then
 * formatting is applied via regex. This means model output cannot inject
 * arbitrary HTML — only the controlled set of tags produced by the
 * replacements below.
 *
 * Supports: code blocks, inline code, bold, italic, unordered/ordered lists,
 * line breaks. Does not support headings, links, images, or tables — these
 * are uncommon in chat and the regex approach doesn't handle them well.
 * For full markdown, use a proper parser (remark/rehype).
 */

export function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML entities first — prevents injection
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // Code blocks (``` ... ```)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) =>
      `<pre class="my-2 overflow-x-auto rounded bg-background/80 p-3 text-xs font-mono ring-1 ring-border"><code data-lang="${lang}">${code.trim()}</code></pre>`,
  )

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-background/80 px-1 py-0.5 text-xs font-mono ring-1 ring-border">$1</code>',
  )

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')

  // Ordered lists
  html = html.replace(
    /^\d+\. (.+)$/gm,
    '<li class="ml-4 list-decimal">$1</li>',
  )

  // Line breaks (but not inside pre blocks)
  html = html.replace(/\n/g, "<br />")

  // Clean up br inside pre
  html = html.replace(
    /(<pre[^>]*>)([\s\S]*?)(<\/pre>)/g,
    (_match, open, content, close) =>
      open + content.replace(/<br \/>/g, "\n") + close,
  )

  return html
}
