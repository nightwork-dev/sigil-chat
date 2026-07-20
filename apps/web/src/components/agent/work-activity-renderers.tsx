import type { ReactNode } from "react"
import {
  BotIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  ExternalLinkIcon,
  FilePenLineIcon,
  FileSearchIcon,
  Globe2Icon,
  ListTodoIcon,
  SearchIcon,
  TerminalSquareIcon,
  XCircleIcon,
} from "lucide-react"

import { ToolCall, ToolState } from "@workspace/ui/components/tool-call"
import {
  getToolOutputData,
  type ToolRendererProps,
} from "@workspace/ui/components/tool-renderer-registry"
import { cn } from "@workspace/ui/lib/utils"

type UnknownRecord = Record<string, unknown>

/**
 * Compact renderers for Eve's framework tools. These are deliberately transcript
 * surfaces, not a shadow task manager, terminal, or browser: they only render
 * state returned in the tool part. Pending approvals and unknown payloads keep
 * the generic renderer, which preserves consent controls and raw inspection.
 */
export function TodoActivityRenderer(props: ToolRendererProps) {
  const activity = readTodoActivity(getToolOutputData(props.part))
  if (!activity || !hasCompletedOutput(props)) return <ToolCall {...props} />

  return (
    <ActivityCard
      icon={<ListTodoIcon />}
      label="Session checklist"
      state={props.part.state}
    >
      <p className="text-xs text-muted-foreground">
        {todoSummary(activity.counts)}
      </p>
      {activity.todos.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {activity.todos.map((todo, index) => (
            <li
              className="flex min-w-0 items-start gap-2 py-2 text-sm"
              key={`${todo.content}:${index}`}
            >
              <TodoStatus status={todo.status} />
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
                  (todo.status === "completed" ||
                    todo.status === "cancelled") &&
                    "text-muted-foreground line-through",
                )}
              >
                {todo.content}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {todo.priority}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No checklist items yet.</p>
      )}
    </ActivityCard>
  )
}

/** Renders only the sandbox contract Eve actually returns: command/status/output. */
export function SandboxActivityRenderer(props: ToolRendererProps) {
  if (!hasCompletedOutput(props)) return <ToolCall {...props} />

  const input = asRecord(props.part.input)
  const output = asRecord(getToolOutputData(props.part))
  if (!output) return <ToolCall {...props} />

  if (props.part.name === "bash" && isBashOutput(output)) {
    return (
      <ActivityCard
        icon={<TerminalSquareIcon />}
        label="Sandbox command"
        state={props.part.state}
      >
        {stringValue(input?.command) ? (
          <CodeBlock label="command" value={stringValue(input?.command)!} />
        ) : null}
        <p className="text-xs text-muted-foreground">
          Exit {numberValue(output.exitCode) ?? "unknown"}
          {output.truncated === true ? " · output truncated" : ""}
        </p>
        {stringValue(output.stdout) || stringValue(output.stderr) ? (
          <CodeBlock
            label={stringValue(output.stderr) ? "stderr / stdout" : "stdout"}
            tone={stringValue(output.stderr) ? "warning" : undefined}
            value={joinOutput(output)}
          />
        ) : null}
      </ActivityCard>
    )
  }

  if (props.part.name === "write_file" && isWriteFileOutput(output)) {
    const path = stringValue(output.path) ?? stringValue(input?.filePath)
    return (
      <ActivityCard
        icon={<FilePenLineIcon />}
        label={
          output.existed === true
            ? "Updated sandbox file"
            : "Created sandbox file"
        }
        state={props.part.state}
      >
        {path ? <PathLabel value={path} /> : null}
        <p className="text-xs text-muted-foreground">
          File content stays in the session workspace.
        </p>
      </ActivityCard>
    )
  }

  if (props.part.name === "read_file" && isReadFileOutput(output)) {
    return (
      <ActivityCard
        icon={<FileSearchIcon />}
        label="Read sandbox file"
        state={props.part.state}
      >
        <PathLabel
          value={
            stringValue(output.path) ??
            stringValue(input?.filePath) ??
            "Unknown path"
          }
        />
        <p className="text-xs text-muted-foreground">
          {numberValue(output.totalLines) ?? "Unknown"} lines
          {output.truncated === true ? " · partial read" : ""}
        </p>
      </ActivityCard>
    )
  }

  if (props.part.name === "grep" && isSearchOutput(output, "matchCount")) {
    return (
      <ActivityCard
        icon={<SearchIcon />}
        label="Searched sandbox files"
        state={props.part.state}
      >
        {stringValue(input?.pattern) ? (
          <CodeBlock label="pattern" value={stringValue(input?.pattern)!} />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {numberValue(output.matchCount) ?? 0} matches in{" "}
          {stringValue(output.path) ?? "workspace"}
          {output.truncated === true ? " · results truncated" : ""}
        </p>
      </ActivityCard>
    )
  }

  if (props.part.name === "glob" && isSearchOutput(output, "count")) {
    return (
      <ActivityCard
        icon={<FileSearchIcon />}
        label="Found sandbox files"
        state={props.part.state}
      >
        {stringValue(input?.pattern) ? (
          <CodeBlock label="pattern" value={stringValue(input?.pattern)!} />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {numberValue(output.count) ?? 0} files in{" "}
          {stringValue(output.path) ?? "workspace"}
          {output.truncated === true ? " · results truncated" : ""}
        </p>
      </ActivityCard>
    )
  }

  return <ToolCall {...props} />
}

/** A compact research receipt. It exposes returned sources, never invents citations. */
export function WebResearchRenderer(props: ToolRendererProps) {
  if (!hasCompletedOutput(props)) return <ToolCall {...props} />

  const input = asRecord(props.part.input)
  const output = getToolOutputData(props.part)

  if (props.part.name === "web_fetch") {
    const fetched = readFetchedPage(output)
    if (!fetched) return <ToolCall {...props} />
    return (
      <ActivityCard
        icon={<Globe2Icon />}
        label="Read web page"
        state={props.part.state}
      >
        <ExternalSource href={fetched.url} label={fetched.url} />
        <p className="text-xs text-muted-foreground">
          {fetched.contentType}
          {fetched.truncated ? " · captured excerpt" : ""}
        </p>
        {fetched.preview ? <Preview value={fetched.preview} /> : null}
      </ActivityCard>
    )
  }

  const results = readSearchResults(output)
  if (!results) return <ToolCall {...props} />
  return (
    <ActivityCard
      icon={<SearchIcon />}
      label="Web research"
      state={props.part.state}
    >
      {stringValue(input?.query) ? (
        <p className="text-xs text-muted-foreground">
          Query:{" "}
          <span className="text-foreground/90">
            {stringValue(input?.query)}
          </span>
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {results.map((result, index) => (
            <li className="min-w-0 py-2" key={`${result.url}:${index}`}>
              <ExternalSource
                href={result.url}
                label={result.title ?? result.url}
              />
              {result.excerpt ? (
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {result.excerpt}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No sources were returned.
        </p>
      )}
    </ActivityCard>
  )
}

/**
 * The transcript gives us the delegated agent's name and completion state, but
 * not its retained lifecycle stream. This card is intentionally a receipt,
 * rather than fake progress, timing, or child-tool telemetry.
 */
export function SubagentActivityRenderer(props: ToolRendererProps) {
  if (!hasCompletedOutput(props)) return <ToolCall {...props} />

  return (
    <ActivityCard
      icon={<BotIcon />}
      label="Delegated review"
      state={props.part.state}
    >
      <p className="text-sm font-medium break-words">{props.part.name}</p>
      <p className="text-xs text-muted-foreground">
        The delegate completed. Its detailed lifecycle stream is not available
        in this chat transcript.
      </p>
      {stringOutput(getToolOutputData(props.part)) ? (
        <Preview value={stringOutput(getToolOutputData(props.part))!} />
      ) : null}
    </ActivityCard>
  )
}

function ActivityCard({
  children,
  icon,
  label,
  state,
}: {
  children: ReactNode
  icon: ReactNode
  label: string
  state: ToolRendererProps["part"]["state"]
}) {
  return (
    <section className="my-1.5 min-w-0 overflow-hidden rounded-lg border border-border bg-card/60">
      <header className="flex min-w-0 items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
        <span className="text-muted-foreground [&>svg]:size-3.5">{icon}</span>
        <p className="min-w-0 flex-1 truncate text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <ToolState state={state} />
      </header>
      <div className="space-y-2 px-3 py-2.5">{children}</div>
    </section>
  )
}

function TodoStatus({ status }: { status: TodoItem["status"] }) {
  if (status === "completed") {
    return <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
  }
  if (status === "cancelled") {
    return (
      <XCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    )
  }
  return (
    <CircleDashedIcon
      className={cn(
        "mt-0.5 size-4 shrink-0 text-muted-foreground",
        status === "in_progress" && "animate-pulse text-primary",
      )}
    />
  )
}

function CodeBlock({
  label,
  tone,
  value,
}: {
  label: string
  tone?: "warning"
  value: string
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border bg-muted/40">
      <p className="border-b border-border/70 px-2 py-1 font-mono text-[10px] text-muted-foreground">
        {label}
      </p>
      <pre
        className={cn(
          "max-h-48 overflow-auto overscroll-contain px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap break-words",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </pre>
    </div>
  )
}

function Preview({ value }: { value: string }) {
  return (
    <p className="line-clamp-4 text-xs leading-relaxed text-foreground/85">
      {value}
    </p>
  )
}

function PathLabel({ value }: { value: string }) {
  return (
    <p className="break-all font-mono text-[11px] text-foreground/85">
      {value}
    </p>
  )
}

function ExternalSource({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="flex min-w-0 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ExternalLinkIcon className="size-3 shrink-0" />
    </a>
  )
}

interface TodoItem {
  content: string
  priority: "high" | "medium" | "low"
  status: "pending" | "in_progress" | "completed" | "cancelled"
}

interface TodoActivity {
  counts: Record<TodoItem["status"] | "total", number>
  todos: TodoItem[]
}

function readTodoActivity(value: unknown): TodoActivity | null {
  const record = asRecord(value)
  if (!record || !Array.isArray(record.todos) || !asRecord(record.counts))
    return null
  const todos = record.todos.flatMap<TodoItem>((candidate) => {
    const item = asRecord(candidate)
    const content = stringValue(item?.content)
    const priority = todoPriority(item?.priority)
    const status = todoStatus(item?.status)
    if (!content || !priority || !status) {
      return []
    }
    return [{ content, priority, status }]
  })
  const countsRecord = asRecord(record.counts)!
  const counts = {
    pending: numberValue(countsRecord.pending) ?? 0,
    in_progress: numberValue(countsRecord.in_progress) ?? 0,
    completed: numberValue(countsRecord.completed) ?? 0,
    cancelled: numberValue(countsRecord.cancelled) ?? 0,
    total: numberValue(countsRecord.total) ?? todos.length,
  }
  return { counts, todos }
}

function todoSummary(counts: TodoActivity["counts"]): string {
  const active = counts.in_progress
  if (active > 0) {
    return `${active} in progress · ${counts.completed} completed · ${counts.total} total`
  }
  return `${counts.completed} completed · ${counts.pending} remaining · ${counts.total} total`
}

function readFetchedPage(value: unknown): {
  contentType: string
  preview?: string
  truncated: boolean
  url: string
} | null {
  const record = asRecord(value)
  const url = stringValue(record?.url)
  const contentType = stringValue(record?.contentType)
  if (!record || !url || !contentType || typeof record.truncated !== "boolean")
    return null
  const content = stringValue(record.content)
  return {
    contentType,
    ...(content ? { preview: compactPreview(content) } : {}),
    truncated: record.truncated,
    url,
  }
}

interface SearchResult {
  excerpt?: string
  title?: string
  url: string
}

function readSearchResults(value: unknown): SearchResult[] | null {
  const record = asRecord(value)
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray(record?.results)
      ? record.results
      : Array.isArray(record?.sources)
        ? record.sources
        : undefined
  if (!candidates) return null
  return candidates.flatMap((candidate) => {
    const item = asRecord(candidate)
    const url = stringValue(item?.url)
    if (!url) return []
    const title = stringValue(item?.title)
    const excerpt = stringValue(item?.excerpt)
    return [
      { url, ...(title ? { title } : {}), ...(excerpt ? { excerpt } : {}) },
    ]
  })
}

function hasCompletedOutput(props: ToolRendererProps): boolean {
  return props.part.state === "output-available"
}

function isBashOutput(value: UnknownRecord): boolean {
  return (
    numberValue(value.exitCode) !== undefined &&
    typeof value.stdout === "string" &&
    typeof value.stderr === "string" &&
    typeof value.truncated === "boolean"
  )
}

function isWriteFileOutput(value: UnknownRecord): boolean {
  return typeof value.path === "string" && typeof value.existed === "boolean"
}

function isReadFileOutput(value: UnknownRecord): boolean {
  return (
    typeof value.path === "string" &&
    numberValue(value.totalLines) !== undefined &&
    typeof value.truncated === "boolean"
  )
}

function isSearchOutput(
  value: UnknownRecord,
  count: "count" | "matchCount",
): boolean {
  return (
    typeof value.path === "string" &&
    numberValue(value[count]) !== undefined &&
    typeof value.truncated === "boolean"
  )
}

function joinOutput(value: UnknownRecord): string {
  const stdout = stringValue(value.stdout)
  const stderr = stringValue(value.stderr)
  return [
    stderr ? `[stderr]\n${stderr}` : "",
    stdout ? `[stdout]\n${stdout}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function stringOutput(value: unknown): string | undefined {
  if (typeof value === "string") return compactPreview(value)
  const record = asRecord(value)
  return (
    compactPreview(
      stringValue(record?.summary) ?? stringValue(record?.message) ?? "",
    ) || undefined
  )
}

function compactPreview(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > 560 ? `${normalized.slice(0, 559)}…` : normalized
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function todoPriority(value: unknown): TodoItem["priority"] | undefined {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : undefined
}

function todoStatus(value: unknown): TodoItem["status"] | undefined {
  return value === "pending" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "cancelled"
    ? value
    : undefined
}
