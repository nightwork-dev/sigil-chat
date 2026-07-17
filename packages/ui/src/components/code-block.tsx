// Lightweight syntax-colorized code/data viewer. No parser dependency —
// tokenizes line-by-line with regex, which is enough for structured data
// (JSON) and keeps this dependency-free. Add more `tokenizers` entries for
// other languages; unknown languages render as plain monospace text.

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"

const tokenVariants = cva("", {
  variants: {
    kind: {
      key: "text-primary",
      string: "text-chart-2",
      number: "text-chart-1",
      boolean: "text-chart-3",
      null: "text-muted-foreground",
      punctuation: "text-foreground/40",
      plain: "text-foreground",
    },
  },
  defaultVariants: { kind: "plain" },
})

interface Token {
  text: string
  kind: VariantProps<typeof tokenVariants>["kind"]
}

type Tokenizer = (line: string) => Token[]

const JSON_LINE_RE =
  /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([[\]{}])|([,:])/g

function tokenizeJsonLine(line: string): Token[] {
  const tokens: Token[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  JSON_LINE_RE.lastIndex = 0

  while ((match = JSON_LINE_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), kind: "plain" })
    }
    lastIndex = match.index + match[0].length

    const [, key, string, number, boolean, nullLit, bracket, punct] = match
    if (key) {
      tokens.push({ text: key, kind: "key" })
      const rest = match[0].slice(key.length)
      if (rest) tokens.push({ text: rest, kind: "punctuation" })
    } else if (string) tokens.push({ text: string, kind: "string" })
    else if (number) tokens.push({ text: number, kind: "number" })
    else if (boolean) tokens.push({ text: boolean, kind: "boolean" })
    else if (nullLit) tokens.push({ text: nullLit, kind: "null" })
    else if (bracket) tokens.push({ text: bracket, kind: "punctuation" })
    else if (punct) tokens.push({ text: punct, kind: "punctuation" })
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), kind: "plain" })
  }

  return tokens
}

const tokenizers: Record<string, Tokenizer> = {
  json: tokenizeJsonLine,
}

function tokenizeLine(line: string, language?: string): Token[] {
  const tokenizer = language ? tokenizers[language] : undefined
  return tokenizer ? tokenizer(line) : [{ text: line, kind: "plain" }]
}

interface CodeBlockProps {
  code: string
  /** Language key from `tokenizers`. Unrecognized values render as plain text. */
  language?: string
  className?: string
}

function CodeBlock({ code, language, className }: CodeBlockProps) {
  const lines = code.split("\n")
  return (
    <pre
      data-slot="code-block"
      className={cn(
        "overflow-x-auto rounded bg-background/80 p-3 text-xs/relaxed font-mono ring-1 ring-border",
        className
      )}
    >
      <code data-lang={language}>
        {lines.map((line, i) => (
          <div key={i} data-slot="code-block-line">
            {tokenizeLine(line, language).map((token, j) => (
              <span key={j} className={cn(tokenVariants({ kind: token.kind }))}>
                {token.text}
              </span>
            ))}
            {line === "" && " "}
          </div>
        ))}
      </code>
    </pre>
  )
}

export { CodeBlock }
export type { CodeBlockProps }
