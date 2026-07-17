# Agent Review Workspace

> Date: 2026-07-16
> Status: Initial implementation
> Source reference: the tapestry repository (read-only extraction)
> Depends on: `AGENT-EMBEDDING-SPEC.md`

## Goal

Prove that the embedded agent is an application capability, not a graph-editor
feature. The review workspace gives a person a document, its revision history,
open decisions, passage feedback, review debt, and an acceptance gate. The
agent HUD follows the person's attention through those surfaces.

The useful loop is:

1. Read or select a passage.
2. Capture feedback or inspect an existing annotation.
3. Resolve decisions and orphaned review debt.
4. Compare revisions.
5. Accept only when the explicit checklist is complete.
6. Ask the agent about the selected passage or review item without leaving the
   workspace.

## Extraction boundary

Tapestry remains the domain application and source of proven interaction
patterns. `@workspace/review` receives only reusable, display-shaped
components and headless review rules.

| Tapestry surface | Shared result |
| --- | --- |
| Piece feedback list | Compound annotation feed with a host-supplied body renderer |
| Draft history panel | Compound revision history over a domain-free revision shape |
| Review workbench | Responsive Sheet/Drawer shell with width variants and lazy panels |
| Decisions, passage composer, debt, acceptance | Existing `@workspace/review` primitives; extend rather than duplicate |

The following remain app-owned:

- Persistence and React Query hooks
- Passage selection and durable anchor creation
- Dictation implementation
- Markdown rendering policy
- Confirmation language and mutation authorization
- Tapestry-specific `Piece`, `Draft`, `Decision`, and `Annotation` store types

## Workspace shape

The Sigil Chat consumer lives under the existing sidebar shell. It is an app
screen, not a showcase:

- the document is the primary surface;
- revision and review state are secondary inspectors;
- the agent is a floating HUD, collapsed by default;
- responsive layouts preserve the reading surface rather than squeezing a
  desktop three-column arrangement onto a phone.

Selection publishes a small `AttentionContext`:

```ts
{
  application: "sigil-chat",
  route: "/review",
  workspace: {
    kind: "review-document",
    id: document.id,
    revision: currentRevision.number,
    label: document.title,
  },
  selection: primaryPassage,
  selections: selectedPassages,
  history: recentFocusAndCommittedReviewActions,
}
```

No document body or DOM scrape is placed in attention context. The selected
passage may contribute a short excerpt, bounded by the attention serializer.

## Gonk boundary

The implemented demo registry exposes:

- `sigil-review-inspect`
- `sigil-review-passages` (multi-id plus bounded adjacent context)
- `sigil-review-decisions`
- `sigil-review-annotations`
- `sigil-review-add-annotation` (batched, approval-gated)
- `sigil-ui-highlight` (semantic target ids; no selectors)

Human-only actions such as locking a decision or signing an acceptance receipt
must remain approval-gated. The component package must not call Gonk or know
that Gonk exists.

## Acceptance

- Review primitives contain no Tapestry imports or store hooks.
- The review route renders inside the existing sidebar chrome.
- Selecting review content changes the HUD's context label.
- Multi-select publishes an ordered passage working set.
- Focus changes and committed review actions enter a bounded semantic history.
- Context privacy is adjustable between Minimal, Focused, and Expanded.
- The agent can retrieve adjacent passages, add visible annotations, and
  highlight registered passages or decisions.
- The workbench mounts only its active panel by default.
- Desktop review width can expand for dense history/feedback panels.
- Review package tests and typecheck pass.
- Web typecheck and production build pass.
- The route is exercised in a real browser at desktop and phone widths, with
  no console errors.
