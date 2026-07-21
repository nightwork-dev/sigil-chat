import { useReducer, useState } from "react"
import {
  AlertTriangleIcon,
  BotIcon,
  CheckSquareIcon,
  FileCheck2Icon,
  GavelIcon,
  GitBranchIcon,
  MessageSquareTextIcon,
  PencilLineIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAcceptReviewRevision,
  useAddReviewAnnotations,
  useLockReviewDecision,
  useReviewDocument,
  useResolveReviewAnnotation,
  useSetReviewAcceptanceCheck,
  useUpdateReviewPassages,
} from "@/lib/review-document"
import { passageDraftReducer, projectPassageDraft } from "@/lib/passage-draft"
import { useAttentionTelemetry } from "@zigil/agent-react/attention-telemetry"
import {
  AttentionProvider,
  type AttentionContext,
  type AttentionSelection,
} from "@zigil/agent-react/attention"
import { getAgentTargetProps } from "@/lib/agent-dom-effects"
import {
  useMediaQuery,
  useRegisterAgentPresentation,
} from "@/lib/agent-surface-registry"
import { AgentSidecar } from "@/components/agent/agent-sidecar"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { AcceptanceChecklist } from "@workspace/review/components/acceptance-checklist"
import { AnnotationOverlay } from "@workspace/ui/components/annotation-overlay"
import { useAgentAnnotationsByAnchor } from "@/lib/agent-annotations"
import { AnnotationComposer } from "@workspace/review/components/annotation-composer"
import { AnnotationFeed } from "@workspace/review/components/annotation-feed"
import { Decisions } from "@workspace/review/components/decisions-panel"
import { ReviewDebtPanel } from "@workspace/review/components/review-debt-panel"
import { RevisionHistory } from "@workspace/review/components/revision-history"
import {
  ReviewWorkbench,
  type WorkbenchTab,
} from "@workspace/review/components/review-workbench"
import {
  findOrphanAnnotations,
  openDecisionCount,
} from "@workspace/review/lib/logic"
import type {
  AcceptanceCheck,
  Annotation,
  AnnotationKind,
  Decision,
  ReviewRevision,
} from "@workspace/review/lib/types"
import { createDraftArticleReviewDocument } from "@workspace/review-store/sample"
import type {
  ReviewDocument,
  ReviewPassage,
} from "@workspace/review-store/types"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ReaderSurface } from "@workspace/ui/components/layouts/reader-surface"
import { SectionHeader } from "@workspace/ui/components/section-header"
import { Separator } from "@workspace/ui/components/separator"
import { TextEditor } from "@workspace/ui/components/text-editor"
import { cn } from "@workspace/ui/lib/utils"

const DOCUMENT_ID = "draft-article-review"

interface Passage extends ReviewPassage {
  section: string
}

const DEFAULT_DOCUMENT = createDraftArticleReviewDocument()

function passagesFromDocument(
  document: ReturnType<typeof createDraftArticleReviewDocument>,
): Passage[] {
  const sectionById = new Map(
    document.outline.map((section) => [section.id, section.title]),
  )
  return document.passages.map((passage) => ({
    ...passage,
    section: sectionById.get(passage.sectionId) ?? passage.title,
  }))
}

const INITIAL_PASSAGES = passagesFromDocument(DEFAULT_DOCUMENT)

function annotationsFromDocument(
  document: ReviewDocument,
): Annotation<string>[] {
  return document.annotations.flatMap((annotation) => {
    const anchors =
      annotation.passageIds.length > 0 ? annotation.passageIds : [null]
    return anchors.map((anchor) => ({
      id:
        anchor && annotation.passageIds.length > 1
          ? `${annotation.id}:${anchor}`
          : annotation.id,
      anchor,
      kind: annotation.kind,
      body: annotation.body,
      author: annotation.author === "agent" ? "agent" : "human",
      status:
        annotation.status === "open"
          ? "active"
          : (annotation.resolution ?? "dismissed"),
      resolutionNote: annotation.resolutionNote,
      resolvedMs: annotation.resolvedAt
        ? Date.parse(annotation.resolvedAt)
        : undefined,
      createdMs: Date.parse(annotation.createdAt),
    }))
  })
}

function decisionsFromDocument(document: ReviewDocument): Decision<string>[] {
  return document.decisions.map((decision) => ({
    id: decision.id,
    ref: DOCUMENT_ID,
    kind: decision.kind,
    title: decision.title,
    body: decision.body,
    status: decision.status,
    proposedBy: decision.proposedBy,
    resolvedBy: decision.status === "locked" ? "human" : undefined,
    createdMs: Date.parse(decision.createdAt),
    resolvedMs: decision.resolvedAt
      ? Date.parse(decision.resolvedAt)
      : undefined,
  }))
}

function revisionsFromDocument(document: ReviewDocument): ReviewRevision[] {
  return document.history.map((revision, index) => ({
    id: revision.id,
    label: revision.label,
    status: index === 0 ? "current" : "superseded",
    parentId: revision.parentId,
    authoredBy: revision.authoredBy,
    details: [`revision ${revision.revision}`],
    note: revision.note,
  }))
}

function passageAttention(passage: Passage): AttentionSelection {
  return {
    kind: "review-passage",
    id: passage.id,
    label: passage.section,
    detail: {
      excerpt: passage.body.slice(0, 320),
      section: passage.section,
    },
  }
}

function enrichPassageAttention(
  selection: AttentionSelection,
  passages: readonly Passage[],
  annotations: readonly Annotation<string>[],
  openDecisions: number,
  reviewDebt: number,
): AttentionSelection {
  const passage = passages.find((item) => item.id === selection.id)
  if (!passage) return selection

  return {
    ...passageAttention(passage),
    detail: {
      ...passageAttention(passage).detail,
      activeAnnotations: String(
        annotations.filter(
          (annotation) =>
            annotation.status === "active" && annotation.anchor === passage.id,
        ).length,
      ),
      openDecisions: String(openDecisions),
      reviewDebt: String(reviewDebt),
    },
  }
}

export function ReviewWorkspace() {
  // §4.1 — this route owns a sidecar presentation in its right rail, so the
  // shell's floating dock suppresses itself here. The claim holds only while
  // the sidecar is actually visible: the rail is hidden below the lg
  // breakpoint, and inside the rail the Passage tab swaps the sidecar out —
  // in both states the dock must come back (a region can't own a
  // presentation it isn't showing).
  const railVisible = useMediaQuery("(min-width: 1024px)")
  const [railTab, setRailTab] = useState<"agent" | "passage">("agent")
  useRegisterAgentPresentation("sidecar", {
    enabled: railVisible && railTab === "agent",
  })
  const reviewDocument = useReviewDocument()
  const updateReviewPassages = useUpdateReviewPassages()
  const addReviewAnnotation = useAddReviewAnnotations()
  const resolveReviewAnnotation = useResolveReviewAnnotation()
  const lockReviewDecision = useLockReviewDecision()
  const setReviewAcceptanceCheck = useSetReviewAcceptanceCheck()
  const acceptReviewRevision = useAcceptReviewRevision()
  const document = reviewDocument.data ?? DEFAULT_DOCUMENT
  const passages = passagesFromDocument(document)
  const annotations = annotationsFromDocument(document)
  const agentAnnotationsByAnchor = useAgentAnnotationsByAnchor()
  const decisions = decisionsFromDocument(document)
  const checklist: AcceptanceCheck[] = document.acceptance.checklist
  const revisions = revisionsFromDocument(document)
  const [editingPassageId, setEditingPassageId] = useState<string | null>(null)
  const [multiSelect, setMultiSelect] = useState(false)
  const telemetry = useAttentionTelemetry({
    initialSelections: [passageAttention(INITIAL_PASSAGES[0])],
    hoverDelayMs: 700,
    historyLimit: 24,
  })
  const recordActivity = telemetry.recordActivity

  const selectedPassage =
    passages.find((passage) => passage.id === telemetry.selection?.id) ??
    passages[0]
  const selectedPassageIds = new Set(
    telemetry.selections.map((selection) => selection.id),
  )
  const activeAnnotations = annotations.filter(
    (annotation) =>
      annotation.status === "active" &&
      annotation.anchor !== null &&
      selectedPassageIds.has(annotation.anchor),
  )
  const openCount = openDecisionCount(decisions)
  const debtCount = findOrphanAnnotations(annotations).length

  const addAnnotation = (kind: AnnotationKind, body: string) => {
    void addReviewAnnotation
      .mutateAsync({
        passageIds: [selectedPassage.id],
        kind,
        body,
        expectedRevision: document.revision,
      })
      .then(({ annotations: created }) => {
        recordActivity("edit", passageAttention(selectedPassage), {
          summary: `Added a ${kind} annotation`,
          detail: { annotationId: created[0]?.id },
        })
        toast.success("Annotation added to the selected passage")
      })
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "Could not add annotation",
        ),
      )
  }

  const lock = (id: string) => {
    void lockReviewDecision
      .mutateAsync({ id, expectedRevision: document.revision })
      .then(() =>
        recordActivity(
          "approve",
          {
            kind: "review-decision",
            id,
            label: decisions.find((decision) => decision.id === id)?.title,
          },
          { summary: "Locked a review decision" },
        ),
      )
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "Could not lock decision",
        ),
      )
  }

  const dismiss = (id: string) => {
    void resolveReviewAnnotation
      .mutateAsync({
        id,
        resolution: "dismissed",
        resolutionNote: "Dismissed during review",
        expectedRevision: document.revision,
      })
      .then(() =>
        recordActivity(
          "dismiss",
          { kind: "review-annotation", id },
          { summary: "Dismissed review debt" },
        ),
      )
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "Could not dismiss debt",
        ),
      )
  }

  const convert = (id: string) => {
    void resolveReviewAnnotation
      .mutateAsync({
        id,
        resolution: "converted",
        resolutionNote: "Converted to a durable document note",
        expectedRevision: document.revision,
      })
      .then(() => {
        recordActivity(
          "edit",
          { kind: "review-annotation", id },
          { summary: "Converted review debt to a durable note" },
        )
        toast.success("Annotation converted to a durable note")
      })
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "Could not convert debt",
        ),
      )
  }

  const toggleAcceptanceCheck = (id: string, checked: boolean) => {
    void setReviewAcceptanceCheck
      .mutateAsync({ id, checked, expectedRevision: document.revision })
      .then(() =>
        recordActivity(
          checked ? "approve" : "edit",
          {
            kind: "acceptance-check",
            id,
            label: checklist.find((check) => check.id === id)?.label,
          },
          {
            summary: checked
              ? "Completed an acceptance check"
              : "Reopened an acceptance check",
          },
        ),
      )
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update acceptance check",
        ),
      )
  }

  const savePassage = async (input: {
    passage: Passage
    body: string
    expectedBody: string
    expectedRevision: number
  }) => {
    if (input.body === input.expectedBody) return true
    const result = await updateReviewPassages.mutateAsync({
      expectedRevision: input.expectedRevision,
      passages: [
        {
          id: input.passage.id,
          body: input.body,
          expectedBody: input.expectedBody,
        },
      ],
    })
    if (!result.applied) {
      toast.error("This passage changed elsewhere. Your draft was preserved.")
      return false
    }
    recordActivity(
      "edit",
      passageAttention({ ...input.passage, body: input.body }),
      {
        summary: `Edited ${input.passage.section}`,
      },
    )
    toast.success("Passage saved")
    return true
  }

  const reviewTabs: WorkbenchTab[] = [
    {
      value: "edit",
      label: "Edit",
      icon: PencilLineIcon,
      content: (
        <PassageEditor
          onSave={(edit) => savePassage({ ...edit, passage: selectedPassage })}
          passage={selectedPassage}
          revision={document.revision}
          saving={updateReviewPassages.isPending}
        />
      ),
    },
    {
      value: "feedback",
      label: "Feedback",
      icon: MessageSquareTextIcon,
      content: (
        <PassageFeedback
          annotations={activeAnnotations}
          onSubmit={addAnnotation}
          passage={selectedPassage}
        />
      ),
    },
    {
      value: "history",
      label: "History",
      icon: GitBranchIcon,
      content: <RevisionHistory.Root revisions={revisions} />,
    },
    {
      value: "decisions",
      label: "Decisions",
      icon: GavelIcon,
      count: openCount,
      content: <Decisions.Root decisions={decisions} onLock={lock} />,
    },
    {
      value: "debt",
      label: "Debt",
      icon: AlertTriangleIcon,
      count: debtCount,
      content: (
        <ReviewDebtPanel
          annotations={annotations}
          onConvert={convert}
          onDismiss={dismiss}
        />
      ),
    },
    {
      value: "accept",
      label: "Accept",
      icon: CheckSquareIcon,
      content: (
        <AcceptanceChecklist
          checklist={checklist}
          onAccept={(input) => {
            void acceptReviewRevision
              .mutateAsync({
                reviewer: input.reviewer,
                device: input.device,
                notes: input.notes,
                expectedRevision: document.revision,
              })
              .then(() =>
                toast.success(`Revision accepted by ${input.reviewer}`),
              )
              .catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not accept revision",
                ),
              )
          }}
          onToggle={toggleAcceptanceCheck}
          submitLabel="Accept revision"
        />
      ),
    },
  ]

  const attentionSelections = telemetry.selections.map((selection) =>
    enrichPassageAttention(
      selection,
      passages,
      annotations,
      openCount,
      debtCount,
    ),
  )
  const attention: AttentionContext = {
    application: "sigil-chat",
    route: "/review",
    workspace: {
      kind: "document-review",
      id: DOCUMENT_ID,
      revision: document.revision,
      label: "Draft Article Review",
    },
    selection: attentionSelections[0],
    selections: attentionSelections,
    hover: telemetry.hover,
    history: telemetry.history,
  }

  return (
    <AttentionProvider context={attention}>
      <div className="relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3 py-2 md:px-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate text-sm font-medium">
                Draft Article Review
              </h1>
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                revision {document.revision}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Select a passage to focus the reviewer and agent.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">
              {openCount} open · {debtCount} debt
            </span>
            <Button
              aria-label="Toggle passage multi-select"
              aria-pressed={multiSelect}
              onClick={() => setMultiSelect((current) => !current)}
              size="sm"
              variant={multiSelect ? "secondary" : "ghost"}
            >
              Multi-select · {telemetry.selections.length}
            </Button>
            <ReviewWorkbench.Root
              description="Annotate the selected passage, settle decisions, clear review debt, then sign off."
              size="lg"
              title="Review — Draft Article"
              trigger={
                <Button size="sm" variant="outline">
                  <FileCheck2Icon />
                  Review
                  {openCount + debtCount > 0 ? (
                    <Badge
                      className="ml-1 h-4 min-w-4 px-1 font-mono text-[9px]"
                      variant="secondary"
                    >
                      {openCount + debtCount}
                    </Badge>
                  ) : null}
                </Button>
              }
            >
              <ReviewWorkbench.Tabs tabs={reviewTabs} />
            </ReviewWorkbench.Root>
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section
            aria-label="Document under review"
            className="min-h-0 overflow-y-auto"
          >
            <ReaderSurface
              className="space-y-3 px-4 pb-28 pt-6 md:px-8 lg:px-12 lg:pb-10"
              measure="wide"
            >
              {passages.map((passage, index) => {
                const selected = selectedPassageIds.has(passage.id)
                const primary = passage.id === selectedPassage.id
                const passageAnnotations = annotations.filter(
                  (annotation) =>
                    annotation.status === "active" &&
                    annotation.anchor === passage.id,
                ).length
                const previousSection = passages[index - 1]?.section
                const editing = editingPassageId === passage.id

                return (
                  <div key={passage.id}>
                    {passage.section !== previousSection ? (
                      <h2 className="mb-3 mt-8 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground first:mt-0">
                        {passage.section}
                      </h2>
                    ) : null}
                    <article
                      className={cn(
                        "group overflow-hidden rounded-r-md border-l-2 text-foreground transition-colors",
                        primary
                          ? "border-primary bg-primary/6"
                          : selected
                            ? "border-primary/50 bg-primary/3"
                            : "border-transparent hover:border-border hover:bg-muted/35",
                      )}
                      onMouseEnter={() =>
                        telemetry.beginHover(passageAttention(passage))
                      }
                      onMouseLeave={() =>
                        telemetry.endHover(passageAttention(passage))
                      }
                      {...getAgentTargetProps(`passage:${passage.id}`)}
                    >
                      <button
                        aria-pressed={selected}
                        className="relative block w-full px-4 py-3 text-left"
                        onClick={(event) => {
                          const target = passageAttention(passage)
                          if (multiSelect || event.metaKey || event.ctrlKey) {
                            const isOnlySelection =
                              selected && telemetry.selections.length === 1
                            if (!isOnlySelection)
                              telemetry.toggleSelection(target)
                          } else {
                            telemetry.select(target)
                          }
                          recordActivity("focus", target, {
                            summary: `Focused ${passage.section}`,
                          })
                        }}
                        type="button"
                      >
                        <span className="block pr-8">{passage.body}</span>
                        {passageAnnotations > 0 ? (
                          <span className="absolute right-2 top-2 font-mono text-[9px] text-muted-foreground">
                            {passageAnnotations}
                          </span>
                        ) : null}
                      </button>

                      <div
                        className={cn(
                          "flex items-center gap-1 border-t border-border/60 px-2 py-1.5 transition-opacity",
                          primary
                            ? "opacity-100"
                            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                        )}
                      >
                        <Button
                          aria-expanded={editing}
                          onClick={() => {
                            telemetry.select(passageAttention(passage))
                            setEditingPassageId((current) =>
                              current === passage.id ? null : passage.id,
                            )
                          }}
                          size="xs"
                          variant={editing ? "secondary" : "ghost"}
                        >
                          <PencilLineIcon />
                          {editing ? "Close editor" : "Edit inline"}
                        </Button>
                        <Button
                          onClick={() => {
                            telemetry.select(passageAttention(passage))
                            recordActivity("focus", passageAttention(passage), {
                              summary: `Asked the agent about ${passage.section}`,
                            })
                          }}
                          size="xs"
                          variant="ghost"
                        >
                          <BotIcon />
                          Ask agent
                        </Button>
                        <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                          {passageAnnotations} note
                          {passageAnnotations === 1 ? "" : "s"}
                        </span>
                      </div>

                      {(agentAnnotationsByAnchor.get(passage.id) ?? []).map((a) => (
                        <AnnotationOverlay
                          key={a.toolCallId}
                          kind={a.kind === "highlight" ? "highlight" : "note"}
                          label={a.label}
                          title={`Passage: “${passage.section}”`}
                          body={<p>{a.body}</p>}
                          meta={<span>sigil-{a.kind} · agent</span>}
                        />
                      ))}

                      {editing ? (
                        <div className="border-t border-border bg-background/60 p-4">
                          <PassageEditor
                            compact
                            onSave={(edit) => savePassage({ ...edit, passage })}
                            passage={passage}
                            revision={document.revision}
                            saving={updateReviewPassages.isPending}
                          />
                        </div>
                      ) : null}
                    </article>
                  </div>
                )
              })}
            </ReaderSurface>
          </section>

          <aside
            className={cn(
              "hidden min-h-0 border-l border-border bg-card/20 lg:block",
            )}
          >
            <Tabs
              className="flex h-full min-h-0 flex-col"
              onValueChange={(value) =>
                setRailTab(value === "passage" ? "passage" : "agent")
              }
              value={railTab}
            >
              <TabsList className="mx-2 mt-2 shrink-0">
                {/* The agent tab defaults: the sidecar IS this route's agent
                    presentation (§4.1); the passage tab is the reviewer's own
                    annotation flow. */}
                <TabsTrigger value="agent">Agent</TabsTrigger>
                <TabsTrigger value="passage">Passage</TabsTrigger>
              </TabsList>
              <TabsContent
                className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                value="agent"
              >
                {/* Bound to the selected passage through the AttentionProvider
                    above — the passage-aware placeholder flows from attention,
                    not a second mount (§4.1). */}
                <AgentSidecar
                  className="min-h-0 flex-1 border-l-0 bg-transparent"
                  subject={selectedPassage.section}
                  subjectDetail={
                    <span className="line-clamp-1">{selectedPassage.body}</span>
                  }
                />
              </TabsContent>
              <TabsContent
                className="min-h-0 flex-1 data-[state=inactive]:hidden"
                value="passage"
              >
                <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                  <div className="border-b border-border px-4 py-3">
                    <SectionHeader
                      action={
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {activeAnnotations.length} notes
                        </span>
                      }
                    >
                      Selected passage
                    </SectionHeader>
                    <p className="mt-2 text-sm font-medium">
                      {selectedPassage.section}
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {selectedPassage.body}
                    </p>
                  </div>
                  <div className="min-h-0 overflow-y-auto p-4">
                    <PassageFeedback
                      annotations={activeAnnotations}
                      onSubmit={addAnnotation}
                      passage={selectedPassage}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </aside>
        </div>

      </div>
    </AttentionProvider>
  )
}

export function PassageEditor({
  compact = false,
  onSave,
  passage,
  revision,
  saving,
}: {
  compact?: boolean
  onSave: (edit: {
    body: string
    expectedBody: string
    expectedRevision: number
  }) => Promise<boolean>
  passage: Passage
  revision: number
  saving: boolean
}) {
  const [draft, dispatchDraft] = useReducer(passageDraftReducer, null)
  const source = {
    passageId: passage.id,
    body: passage.body,
    revision,
  }
  const projected = projectPassageDraft(draft, source)

  const saveDraft = async (expectedBody: string, expectedRevision: number) => {
    const saved = await onSave({
      body: projected.body,
      expectedBody,
      expectedRevision,
    })
    if (saved) dispatchDraft({ type: "saved" })
  }

  return (
    <div className="space-y-3">
      <div className={cn(compact && "sr-only")}>
        <SectionHeader>Edit {passage.section}</SectionHeader>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Changes update the shared review document and are available to the
          embedded agent.
        </p>
      </div>
      <TextEditor
        aria-label={`Edit ${passage.section} passage`}
        className={cn(compact ? "min-h-28" : "min-h-40")}
        disabled={saving}
        onBlur={() => {
          if (!projected.dirty || projected.conflict) return
          void saveDraft(projected.expectedBody, projected.expectedRevision)
        }}
        onChange={(value) => {
          dispatchDraft({ type: "edit", body: value, source })
        }}
        placeholder="Write the selected passage…"
        value={projected.body}
      />
      {projected.conflict ? (
        <div
          className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3"
          role="alert"
        >
          <div>
            <p className="text-sm font-medium">
              This passage changed elsewhere
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Your draft is still in the editor. The saved revision is shown
              below; choose explicitly which version to keep.
            </p>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="min-w-0 rounded-md border bg-background/60 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Your draft
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">
                {projected.conflict.localBody}
              </p>
            </div>
            <div className="min-w-0 rounded-md border bg-background/60 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Saved revision {projected.conflict.persistedRevision}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">
                {projected.conflict.persistedBody}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saving}
              onClick={() => dispatchDraft({ type: "discard" })}
              size="sm"
              type="button"
              variant="outline"
            >
              Use saved revision
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                void saveDraft(passage.body, revision)
              }}
              size="sm"
              type="button"
            >
              Replace with my draft
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PassageFeedback({
  annotations,
  onSubmit,
  passage,
}: {
  annotations: readonly Annotation<string>[]
  onSubmit: (kind: AnnotationKind, body: string) => void
  passage: Passage
}) {
  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>Annotate {passage.section}</SectionHeader>
        <AnnotationComposer
          className="mt-3"
          onSubmit={onSubmit}
          placeholder="What should the next pass preserve or change?"
          submitLabel="Add annotation"
        />
      </div>
      <Separator />
      <div>
        <SectionHeader>Active feedback</SectionHeader>
        <AnnotationFeed.Root
          annotations={annotations}
          className="mt-3"
          formatTimestamp={(createdMs) =>
            new Date(createdMs).toISOString().slice(0, 10)
          }
        >
          {annotations.length > 0 ? undefined : (
            <AnnotationFeed.Empty>
              No feedback is anchored here yet. Add the first annotation or ask
              the agent to inspect this passage.
            </AnnotationFeed.Empty>
          )}
        </AnnotationFeed.Root>
      </div>
    </div>
  )
}
