"use client"

import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, FilePlus2Icon, FileTextIcon, PencilLineIcon } from "lucide-react"
import { toast } from "sonner"

import { ChatMarkdown } from "@workspace/chat/components/chat-markdown"
import {
  type ProductSpec,
  useCreateSpec,
  useReviseSpec,
  useSpecs,
  useTransitionSpec,
} from "@/lib/specs"
import type { SpecStatus } from "@workspace/work-items-store/specs"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

const SPEC_STATUSES: { value: SpecStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "In review" },
  { value: "accepted", label: "Accepted" },
  { value: "superseded", label: "Superseded" },
  { value: "archived", label: "Archived" },
]

function statusLabel(status: SpecStatus): string {
  return SPEC_STATUSES.find((candidate) => candidate.value === status)?.label ?? status
}

export function SpecsWorkspace({ initialSelectedId }: { initialSelectedId?: string }) {
  const navigate = useNavigate({ from: "/roadmap" })
  const specsQuery = useSpecs()
  const specs = specsQuery.data?.specs ?? []
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? null,
  )
  const [creating, setCreating] = useState(false)
  const selected = specs.find((spec) => spec.id === selectedId) ?? null
  const detailOpen = creating || selected !== null

  const selectSpec = (id: string) => {
    setCreating(false)
    setSelectedId(id)
    void navigate({ search: { view: "specs", spec: id } })
  }

  const closeDetail = () => {
    setCreating(false)
    setSelectedId(null)
    void navigate({ search: { view: "specs" } })
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden bg-background md:grid-cols-[minmax(18rem,0.8fr)_minmax(24rem,1.2fr)]">
      <section
        aria-label="Specifications"
        className={cn("min-h-0 flex-col border-r border-border", detailOpen ? "hidden md:flex" : "flex")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {specs.length} {specs.length === 1 ? "spec" : "specs"}
          </p>
          <Button
            size="sm"
            onClick={() => {
              setCreating(true)
              setSelectedId(null)
            }}
          >
            <FilePlus2Icon />
            New spec
          </Button>
        </div>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto p-3">
          {specsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading specifications…</p>
          ) : specsQuery.error ? (
            <p className="text-sm text-destructive">Could not load specifications.</p>
          ) : specs.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No specifications yet</EmptyTitle>
                <EmptyDescription>
                  Create the first durable specification for this roadmap.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="space-y-2">
              {specs.map((spec) => (
                <li key={spec.id}>
                  <button
                    type="button"
                    aria-pressed={!creating && selectedId === spec.id}
                    onClick={() => selectSpec(spec.id)}
                    className={cn(
                      "flex min-h-11 w-full flex-col gap-2 rounded-md border bg-card p-3 text-left transition-colors",
                      !creating && selectedId === spec.id
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <span className="flex w-full items-start justify-between gap-3">
                      <span className="font-medium leading-5">{spec.title}</span>
                      <Badge variant="outline" className="shrink-0">
                        {statusLabel(spec.status)}
                      </Badge>
                    </span>
                    <span className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                      {spec.summary}
                    </span>
                    <span className="font-mono text-[0.6875rem] text-muted-foreground">
                      {spec.id}
                      {spec.storyIds.length > 0
                        ? ` · ${spec.storyIds.length} linked ${spec.storyIds.length === 1 ? "story" : "stories"}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        aria-label="Specification detail"
        className={cn("scroll-area min-h-0 overflow-y-auto", detailOpen ? "block" : "hidden md:block")}
      >
        {detailOpen ? (
          <div className="sticky top-0 z-10 border-b border-border bg-background p-2 md:hidden">
            <Button size="sm" variant="ghost" onClick={closeDetail}>
              <ArrowLeftIcon />
              All specs
            </Button>
          </div>
        ) : null}
        {creating ? (
          <CreateSpecForm
            onCreated={(spec) => {
              selectSpec(spec.id)
            }}
          />
        ) : selected ? (
          <SpecDetail key={selected.id} spec={selected} />
        ) : (
          <div className="p-4">
            <Empty className="border">
              <EmptyHeader>
                <FileTextIcon />
                <EmptyTitle>Select a specification</EmptyTitle>
                <EmptyDescription>
                  Read its contract, edit it, or follow its linked stories back to the board.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </section>
    </div>
  )
}

function CreateSpecForm({ onCreated }: { onCreated: (spec: ProductSpec) => void }) {
  const create = useCreateSpec()
  const [id, setId] = useState("")
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [body, setBody] = useState("")
  const [storyIds, setStoryIds] = useState("")
  const canCreate =
    id.trim().length > 0 &&
    title.trim().length > 0 &&
    summary.trim().length > 0 &&
    body.trim().length > 0 &&
    !create.isPending

  const submit = () =>
    create
      .mutateAsync({
        id: id.trim(),
        title: title.trim(),
        summary: summary.trim(),
        body: body.trim(),
        storyIds: parseIds(storyIds),
      })
      .then((result) => {
        toast.success("Specification created")
        onCreated(result.spec)
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not create specification"),
      )

  return (
    <div className="space-y-5 p-4">
      <div>
        <h2 className="text-lg font-semibold">New specification</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The identifier is permanent. Linked story IDs keep implementation work attached to this contract.
        </p>
      </div>
      <Field label="Identifier">
        <Input value={id} onChange={(event) => setId(event.target.value)} placeholder="SPEC-NAME" />
      </Field>
      <Field label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Summary">
        <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="min-h-20" />
      </Field>
      <Field label="Linked stories" hint="Comma-separated roadmap IDs">
        <Input value={storyIds} onChange={(event) => setStoryIds(event.target.value)} placeholder="S1.10, SC.5" />
      </Field>
      <Field label="Specification" hint="Markdown; begin body sections at level two">
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-64 font-mono text-sm" />
      </Field>
      <Button disabled={!canCreate} onClick={submit}>
        <FilePlus2Icon />
        Create specification
      </Button>
    </div>
  )
}

function SpecDetail({ spec }: { spec: ProductSpec }) {
  const revise = useReviseSpec()
  const transition = useTransitionSpec()
  const [title, setTitle] = useState(spec.title)
  const [summary, setSummary] = useState(spec.summary)
  const [body, setBody] = useState(spec.body)
  const [storyIds, setStoryIds] = useState(spec.storyIds.join(", "))
  const [editing, setEditing] = useState(false)
  const parsedStoryIds = parseIds(storyIds)
  const dirty =
    title.trim() !== spec.title ||
    summary.trim() !== spec.summary ||
    body.trim() !== spec.body ||
    parsedStoryIds.join("\u0000") !== spec.storyIds.join("\u0000")
  const canSave =
    dirty &&
    title.trim().length > 0 &&
    summary.trim().length > 0 &&
    body.trim().length > 0 &&
    !revise.isPending

  const save = () =>
    revise
      .mutateAsync({
        id: spec.id,
        title: title.trim(),
        summary: summary.trim(),
        body: body.trim(),
        storyIds: parsedStoryIds,
      })
      .then(() => toast.success("Specification saved"))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not save specification"),
      )

  const move = (status: SpecStatus) =>
    transition
      .mutateAsync({ id: spec.id, status })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Could not change specification status"),
      )

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{spec.id}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Authored by {spec.authoredBy} · updated {new Date(spec.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={spec.status} onValueChange={(value) => void move(value as SpecStatus)} disabled={transition.isPending}>
            <SelectTrigger className="w-36" aria-label="Specification status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEC_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((current) => !current)}>
            <PencilLineIcon />
            {editing ? "Reading view" : "Edit"}
          </Button>
        </div>
      </div>

      {editing ? (
        <>
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Summary">
            <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="min-h-20" />
          </Field>
          <Field label="Linked stories" hint="Comma-separated roadmap IDs">
            <Input value={storyIds} onChange={(event) => setStoryIds(event.target.value)} />
          </Field>
          <Field label="Specification" hint="Markdown; begin body sections at level two">
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-[28rem] font-mono text-sm" />
          </Field>
          <div className="flex items-center gap-2">
            <Button disabled={!canSave} onClick={save}>
              <PencilLineIcon />
              Save changes
            </Button>
            {dirty ? <span className="text-xs text-muted-foreground">Unsaved edits</span> : null}
          </div>
        </>
      ) : (
        <SpecReadingView spec={spec} />
      )}
    </div>
  )
}

function SpecReadingView({ spec }: { spec: ProductSpec }) {
  return (
    <article className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{spec.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{spec.summary}</p>
      </div>
      {spec.storyIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
          <span className="text-xs text-muted-foreground">Linked work</span>
          {spec.storyIds.map((storyId) => (
            <Button key={storyId} size="xs" variant="outline" nativeButton={false} render={<Link to="/roadmap" search={{ view: "board", story: storyId }} />}>
              {storyId}
            </Button>
          ))}
        </div>
      ) : null}
      <ChatMarkdown content={spec.body} className="max-w-none pb-8" />
    </article>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-xs font-medium">{label}</label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function parseIds(value: string): string[] {
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))]
}
