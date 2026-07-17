import { useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangleIcon,
  CheckSquareIcon,
  ClipboardCheckIcon,
  GavelIcon,
  MessagesSquareIcon,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Decisions } from "@workspace/review/components/decisions-panel"
import { AnnotationComposer } from "@workspace/review/components/annotation-composer"
import { AnnotationFeed } from "@workspace/review/components/annotation-feed"
import { ReviewDebtPanel } from "@workspace/review/components/review-debt-panel"
import { AcceptanceChecklist } from "@workspace/review/components/acceptance-checklist"
import { RevisionHistory } from "@workspace/review/components/revision-history"
import { ReviewWorkbench, type WorkbenchTab } from "@workspace/review/components/review-workbench"
import { lockDecision, dismissAnnotation, convertAnnotation, openDecisionCount, findOrphanAnnotations } from "@workspace/review/lib/logic"
import type {
  AcceptanceCheck,
  Annotation,
  Decision,
  ReviewRevision,
} from "@workspace/review/lib/types"
import { Exhibit } from "@/components/showcase/exhibit"

// Review — the two-actor (agent proposes ↔ human approves) review loop over any
// content. Every surface here is domain-free and props-driven; the mock draft
// below (a manuscript under revision) is the *host* data the panels render, and
// this component owns the state seam (lock / dismiss / convert / toggle) so the
// demos are genuinely interactive. The workbench gathers the panels into one
// Sheet/Drawer. These components ship from @workspace/review (a workspace
// package like chat/data), not packages/ui's installable registry — so they
// have no `installName` and no copyable install snippet.

// Fixed timestamps (not Date.now) so nothing derives from the clock in render —
// SSR-stable. Event handlers stamp resolutions with Date.now when they fire.
const DAY = 86_400_000
const T0 = 1_720_000_000_000

const INITIAL_DECISIONS: Decision[] = [
  { id: "d1", ref: "ch3", kind: "canon", title: "Rename the derelict ship to “Ardent”", body: "The agent proposes renaming to match the epigraph. Awaiting your lock.", status: "open", proposedBy: "agent", createdMs: T0 - 2 * DAY },
  { id: "d2", ref: "ch3", kind: "craft", title: "Cut the flashback in scene 2", body: "Pacing drags; the flashback repeats what the dialogue already says.", status: "open", proposedBy: "human", createdMs: T0 - DAY },
  { id: "d3", ref: "ch2", kind: "structure", title: "Merge scenes 4 and 5", body: "Locked earlier — the scene break added no beat.", status: "locked", proposedBy: "agent", resolvedBy: "human", createdMs: T0 - 5 * DAY, resolvedMs: T0 - 4 * DAY },
  { id: "d4", ref: "ch1", kind: "canon", title: "Original war timeline", body: "Superseded by a newer decision that redates the siege.", status: "superseded", proposedBy: "agent", createdMs: T0 - 9 * DAY, resolvedMs: T0 - 6 * DAY },
]

const INITIAL_ANNOTATIONS: Annotation<string>[] = [
  { id: "a1", anchor: "p-12", kind: "flag", body: "Anchor still resolves — not debt.", author: "human", status: "active", createdMs: T0 - DAY },
  { id: "a2", anchor: null, kind: "question", body: "Does this contradict the prologue’s claim that the ship was never named?", author: "human", status: "active", createdMs: T0 - 2 * DAY },
  { id: "a3", anchor: null, kind: "flag", body: "The timeline math here no longer adds up after the ch.2 merge.", author: "agent", status: "active", createdMs: T0 - 2 * DAY },
  { id: "a4", anchor: "p-30", kind: "note", body: "Anchor resolves — filtered out of debt.", author: "human", status: "active", createdMs: T0 - 3 * DAY },
  { id: "a5", anchor: null, kind: "note", body: "Marginalia that lost its paragraph when scene 5 was cut.", author: "human", status: "active", createdMs: T0 - 4 * DAY },
]

const INITIAL_CHECKLIST: AcceptanceCheck[] = [
  { id: "c1", label: "Reads cleanly start to finish on a phone", checked: false },
  { id: "c2", label: "No orphaned annotations left in debt", checked: false },
  { id: "c3", label: "Every open decision is locked or superseded", checked: false },
]

const REVISIONS: ReviewRevision[] = [
  {
    id: "rev-3",
    label: "Restructured chapter",
    status: "current",
    parentId: "rev-2",
    authoredBy: "human",
    details: ["2,418 words", "3 scenes"],
    note: "Merged the two arrival scenes and restored the ship-name reveal.",
  },
  {
    id: "rev-2",
    label: "Agent pacing pass",
    status: "superseded",
    parentId: "rev-1",
    authoredBy: "agent",
    details: ["2,206 words", "4 scenes"],
    note: "Cut the flashback and tightened the exchange on the bridge.",
  },
  {
    id: "rev-1",
    label: "Imported draft",
    status: "superseded",
    authoredBy: "human",
    details: ["2,731 words", "4 scenes"],
  },
]

export function ReviewShowcase() {
  const [decisions, setDecisions] = useState<Decision[]>(INITIAL_DECISIONS)
  const [lockingId, setLockingId] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<Annotation<string>[]>(INITIAL_ANNOTATIONS)
  const [checklist, setChecklist] = useState<AcceptanceCheck[]>(INITIAL_CHECKLIST)

  const lock = (id: string) => {
    setLockingId(id)
    // Simulate the host's async persist; the lock is the human-only approval.
    setTimeout(() => {
      setDecisions((prev) => prev.map((d) => (d.id === id ? lockDecision(d, Date.now()) : d)))
      setLockingId(null)
    }, 350)
  }

  const dismiss = (id: string) =>
    setAnnotations((prev) => prev.map((a) => (a.id === id ? dismissAnnotation(a, "rejected in review", Date.now()) : a)))

  const convert = (id: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? convertAnnotation(a, "kept as a durable note", Date.now()) : a)))
    toast.success("Converted to a durable note")
  }

  const toggleCheck = (id: string, checked: boolean) =>
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, checked } : c)))

  const openCount = openDecisionCount(decisions)
  const debtCount = findOrphanAnnotations(annotations).length

  // The workbench tabs — the host composes the panels (the same wired panels
  // used in the standalone exhibits) and hands them in as tab content.
  const workbenchTabs: WorkbenchTab[] = [
    {
      value: "decisions",
      label: "Decisions",
      icon: GavelIcon,
      count: openCount,
      content: <Decisions.Root decisions={decisions} onLock={lock} lockingId={lockingId} />,
    },
    {
      value: "feedback",
      label: "Feedback",
      icon: MessagesSquareIcon,
      content: <AnnotationFeed.Root annotations={annotations} />,
    },
    {
      value: "debt",
      label: "Debt",
      icon: AlertTriangleIcon,
      count: debtCount,
      content: <ReviewDebtPanel annotations={annotations} onDismiss={dismiss} onConvert={convert} />,
    },
    {
      value: "accept",
      label: "Accept",
      icon: CheckSquareIcon,
      content: (
        <AcceptanceChecklist
          checklist={checklist}
          onToggle={toggleCheck}
          onAccept={(input) => toast.success(`Signed off by ${input.reviewer}`)}
        />
      ),
    },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
      <Exhibit title="Decisions Panel" subtitle="the human’s review queue · Lock is human-only, and renders only on open decisions" className="lg:col-span-2">
        <Decisions.Root decisions={decisions} onLock={lock} lockingId={lockingId} />
      </Exhibit>

      <Exhibit title="Annotation Composer" subtitle="note / flag / question / approval · ⌘↵ to save · semantic tone per kind">
        <AnnotationComposer
          onSubmit={(kind, body) => toast.success(`${kind}: ${body.slice(0, 40)}${body.length > 40 ? "…" : ""}`)}
          placeholder="Flag a passage, ask a question, or approve…"
        />
      </Exhibit>

      <Exhibit title="Acceptance Checklist" subtitle="human sign-off gate · Accept stays inert until every box is ticked + a reviewer is named">
        <AcceptanceChecklist
          checklist={checklist}
          onToggle={toggleCheck}
          onAccept={(input) => toast.success(`Signed off by ${input.reviewer}`)}
        />
      </Exhibit>

      <Exhibit title="Review Debt Panel" subtitle="orphaned annotations (anchor no longer resolves) · dismiss or convert · derived, not stored" className="lg:col-span-2">
        <ReviewDebtPanel annotations={annotations} onDismiss={dismiss} onConvert={convert} />
      </Exhibit>

      <Exhibit title="Annotation Feed" subtitle="domain-free review stream · host controls filtering, Markdown, and persistence">
        <AnnotationFeed.Root annotations={annotations} />
      </Exhibit>

      <Exhibit title="Revision History" subtitle="lineage and lifecycle over any reviewed content variant">
        <RevisionHistory.Root revisions={REVISIONS} />
      </Exhibit>

      <Exhibit title="Review Workbench" subtitle="the whole loop in one responsive shell · right Sheet on desktop, bottom Drawer on a phone" className="lg:col-span-2">
        <div className="flex flex-col items-start gap-3">
          <p className="text-xs text-muted-foreground">
            Gathers Decisions, Debt, and Accept into a tabbed overlay; the tab badges are the live
            “needs you” counts ({openCount} open {openCount === 1 ? "decision" : "decisions"}, {debtCount} orphaned).
            Open it, lock a decision or clear a debt item, and watch the badges fall.
          </p>
          <ReviewWorkbench.Root
            trigger={
              <Button variant="outline" size="sm">
                <ClipboardCheckIcon className="size-4" /> Open review workbench
              </Button>
            }
            title="Review — Chapter 3"
            description="Agent proposes, you approve. Lock, triage debt, then sign off."
            size="lg"
          >
            <ReviewWorkbench.Tabs tabs={workbenchTabs} />
          </ReviewWorkbench.Root>
        </div>
      </Exhibit>
    </div>
  )
}
