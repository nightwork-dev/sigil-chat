import { describe, expect, it } from "vitest"

import {
  ADD_SOURCES,
  mergeWorkspaceResourceCandidates,
  type AddSourceKind,
} from "./add-sources"
import type { ArtifactRecord } from "./artifacts"
import { artifactUrl } from "./artifacts"
import type { EvidenceDocument } from "./evidence"

describe("ADD_SOURCES", () => {
  it("contains only the three attachable nouns, files first", () => {
    expect(ADD_SOURCES.map((source) => source.kind)).toEqual([
      "files",
      "workspace-resource",
      "session-note",
    ])
  })

  it("never contains a verb kind (skills, tools, compose modes are rejected by §9.8)", () => {
    // A closed union means this is really a compile-time guarantee — this
    // assertion documents the contract at runtime too, so a future
    // structural change that widens the union without updating this test
    // fails loudly instead of silently admitting a verb.
    const REJECTED: readonly string[] = [
      "skill",
      "tool",
      "compose-mode",
      "goal",
      "plan-mode",
    ]
    for (const source of ADD_SOURCES) {
      expect(REJECTED).not.toContain(source.kind)
    }
  })

  it("every kind has a non-empty label and description", () => {
    for (const source of ADD_SOURCES) {
      expect(source.label.length).toBeGreaterThan(0)
      expect(source.description.length).toBeGreaterThan(0)
    }
  })
})

describe("mergeWorkspaceResourceCandidates", () => {
  const evidence: EvidenceDocument[] = [
    {
      id: "doc-1",
      filename: "brief.pdf",
      mediaType: "application/pdf",
      size: 1024,
      createdAt: "2026-07-01T00:00:00.000Z",
      url: "/api/evidence/doc-1",
    },
  ]
  const artifacts: ArtifactRecord[] = [
    {
      id: "artifact-1",
      filename: "output.json",
      mediaType: "application/json",
      size: 256,
      createdAt: "2026-07-02T00:00:00.000Z",
    },
  ]

  it("merges evidence documents and artifacts, tagging each by kind", () => {
    const result = mergeWorkspaceResourceCandidates(
      evidence,
      artifacts,
      "session:thread-1",
    )
    expect(result).toEqual([
      {
        id: "doc-1",
        kind: "evidence",
        filename: "brief.pdf",
        mediaType: "application/pdf",
        size: 1024,
        url: "/api/evidence/doc-1",
      },
      {
        id: "artifact-1",
        kind: "artifact",
        filename: "output.json",
        mediaType: "application/json",
        size: 256,
        url: artifactUrl("artifact-1", "session:thread-1"),
      },
    ])
  })

  it("builds the artifact url from the passed scope, not a hardcoded one", () => {
    const result = mergeWorkspaceResourceCandidates(
      [],
      artifacts,
      "project:proj-1",
    )
    expect(result[0]?.url).toBe(artifactUrl("artifact-1", "project:proj-1"))
    expect(result[0]?.url).not.toBe(artifactUrl("artifact-1", "session:thread-1"))
  })

  it("returns an empty list when both sources are empty", () => {
    expect(mergeWorkspaceResourceCandidates([], [], "session:thread-1")).toEqual(
      [],
    )
  })
})

// Type-level check that the union really is closed to the three §9.8(a)
// nouns — this will fail to compile (not just fail at runtime) if a verb
// kind is ever added without deliberately widening the contract.
const _exhaustive: (kind: AddSourceKind) => "files" | "workspace-resource" | "session-note" =
  (kind) => kind
void _exhaustive
