// Agent annotation tools — the producer side of overlay projection.
//
// These tools let the agent leave a note ON something it's working on, rather
// than only in the transcript. Their output carries `{ anchorId, body, kind }`;
// the HOST renders it (per AGENT-OUTPUT-PROJECTION-SPEC.md §3.2) as an overlay
// anchored to the attention item `anchorId` references — not as a transcript
// line.
//
// Authorization (§4.1 of the projection spec, Vesper's boundary): scope
// membership authorizes the tool call. `anchorId` is a DISPLAY HINT the host
// resolves, NOT authorization evidence — the model/browser repeating an id
// grants nothing. These tools are `approval: "write"` (they produce durable
// agent output) but they carry no authority beyond what the calling principal's
// scope membership already grants.

import { shape, type ToolRegistry } from "@gonk/tool-registry"

import { writeHints, objectSchema } from "./domain-schemas.js"
import { hasOnlyKeys, isRecord } from "./validators.js"

// ─── Input shapes ──────────────────────────────────────────────────────────

type AnnotationKind = "note" | "pin" | "highlight"

interface AnnotationInput {
  /** AttentionSelection.id the annotation anchors to (display hint, not authority). */
  anchorId: string
  /** The annotation body — markdown or plain text the host renders in the overlay. */
  body: string
}

interface AnnotationWithKindInput extends AnnotationInput {
  /** Optional label; defaults to a kind-appropriate one. */
  label?: string
}

// ─── Validators ────────────────────────────────────────────────────────────

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isAnnotationInput(
  value: unknown,
): value is AnnotationInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["anchorId", "body"]) &&
    isNonEmptyString(value.anchorId) &&
    isNonEmptyString(value.body)
  )
}

function isAnnotationWithKindInput(
  value: unknown,
): value is AnnotationWithKindInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["anchorId", "body", "label"]) &&
    isNonEmptyString(value.anchorId) &&
    isNonEmptyString(value.body) &&
    (value.label === undefined || isNonEmptyString(value.label))
  )
}

// ─── Output shape ──────────────────────────────────────────────────────────
//
// The output is what the host's projection registry reads to render the overlay.
// `anchorId` references an AttentionContext.selections item; `kind` maps to a
// projector + visual variant; `mode` is persistent by default (annotations are
// durable agent output, like any tool result).

export interface AnnotationOutput {
  readonly anchorId: string
  readonly body: string
  readonly kind: AnnotationKind
  readonly label: string
  readonly mode: "persistent"
}

function makeOutput(
  input: AnnotationInput | AnnotationWithKindInput,
  kind: AnnotationKind,
): AnnotationOutput {
  const label =
    "label" in input && input.label
      ? input.label
      : defaultLabel(kind)
  return {
    anchorId: input.anchorId,
    body: input.body,
    kind,
    label,
    mode: "persistent",
  }
}

function defaultLabel(kind: AnnotationKind): string {
  switch (kind) {
    case "note":
      return "Agent note"
    case "pin":
      return "Pinned"
    case "highlight":
      return "Highlight"
  }
}

const ANNOTATION_BODY_SCHEMA = {
  type: "string",
  minLength: 1,
  description:
    "The annotation body. Markdown or plain text the host renders in the overlay anchored to anchorId.",
}

// ─── Registration ──────────────────────────────────────────────────────────

export function registerAnnotationTools(registry: ToolRegistry): void {
  registry.register({
    name: "sigil-annotate",
    description:
      "Leave a persistent note anchored to a specific attention item (a selected passage, focused element). The note renders as an overlay the user can expand, not just a transcript line. Use while reviewing or working on a specific subject.",
    visibility: "always",
    approval: "write",
    input: shape<AnnotationInput>(
      isAnnotationInput,
      "Expected { anchorId: string, body: string }.",
    ),
    inputJsonSchema: objectSchema(
      { anchorId: { type: "string", minLength: 1 }, body: ANNOTATION_BODY_SCHEMA },
      ["anchorId", "body"],
    ),
    hints: writeHints,
    handler: async (input) => ({ data: makeOutput(input, "note") }),
  })

  registry.register({
    name: "sigil-pin",
    description:
      "Pin a remark to a specific attention item — a persistent marker the user will notice on return, lighter-weight than a full note. Renders as an overlay anchor.",
    visibility: "always",
    approval: "write",
    input: shape<AnnotationWithKindInput>(
      isAnnotationWithKindInput,
      "Expected { anchorId: string, body: string, label?: string }.",
    ),
    inputJsonSchema: objectSchema(
      {
        anchorId: { type: "string", minLength: 1 },
        body: ANNOTATION_BODY_SCHEMA,
        label: { type: "string", minLength: 1 },
      },
      ["anchorId", "body"],
    ),
    hints: writeHints,
    handler: async (input) => ({ data: makeOutput(input, "pin") }),
  })

  registry.register({
    name: "sigil-highlight",
    description:
      "Flag a specific attention item for the user's attention (e.g. a continuity issue, a turn to revisit). Renders as a primary-weighted overlay distinct from a quiet note.",
    visibility: "always",
    approval: "write",
    input: shape<AnnotationWithKindInput>(
      isAnnotationWithKindInput,
      "Expected { anchorId: string, body: string, label?: string }.",
    ),
    inputJsonSchema: objectSchema(
      {
        anchorId: { type: "string", minLength: 1 },
        body: ANNOTATION_BODY_SCHEMA,
        label: { type: "string", minLength: 1 },
      },
      ["anchorId", "body"],
    ),
    hints: writeHints,
    handler: async (input) => ({ data: makeOutput(input, "highlight") }),
  })
}
