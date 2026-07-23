import type { ArtifactRecord } from "./artifacts"
import { artifactUrl } from "./artifacts"
import type { EvidenceDocument } from "./evidence"

// SC.10 §9.8 — the ＋ Add menu's extension contract, enforced in the type
// system, not just prose. `AddSourceKind` is a CLOSED union: every render
// site (AddMenu) switches over it exhaustively, so adding a new entry that
// isn't a noun forces a compile error at the switch, not a silent menu
// addition. This is the "noun ∧ attaches-to-session ∧ principal-visible ∧
// bounded" contract from §9.8(b) — a verb (skill invocation, a tool quick
// action, a compose mode) has no home in this union and must not be added
// here; it belongs in /skills or the message text instead.
export type AddSourceKind = "files" | "workspace-resource" | "session-note"

export interface AddSourceDescriptor {
  readonly kind: AddSourceKind
  readonly label: string
  readonly description: string
}

/** §9.8(a) — initial contents, in display order. Attach files is always
 *  first (the primary entry). */
export const ADD_SOURCES: readonly AddSourceDescriptor[] = [
  {
    kind: "files",
    label: "Attach files",
    description: "Images, PDFs, and documents",
  },
  {
    kind: "workspace-resource",
    label: "Add from workspace",
    description: "A document or artifact already in this scope",
  },
  {
    kind: "session-note",
    label: "Session note",
    description: "This session's shared scratch notes",
  },
]

/** A workspace-resource candidate the ＋ menu's "Add from workspace" picker
 *  can offer — already-stored bytes (evidence document or artifact), never a
 *  freshly uploaded file. Both source queries are server-side,
 *  principal-scoped reads (§9.8(b)(3)); this type only describes what's
 *  already been filtered, it does no filtering of its own. */
export interface WorkspaceResourceCandidate {
  readonly id: string
  readonly kind: "evidence" | "artifact"
  readonly filename: string
  readonly mediaType: string
  readonly size?: number
  readonly url: string
}

/** Pure merge of the two existing principal-filtered listings into one
 *  displayable, boundedly-selectable set (§9.8(b)(4) — a picker over what's
 *  already visible, never a browsable catalog of its own). Evidence
 *  documents already carry a served `url`; artifacts need one built from
 *  their id + the scope they were listed under. */
export function mergeWorkspaceResourceCandidates(
  evidence: readonly EvidenceDocument[],
  artifacts: readonly ArtifactRecord[],
  artifactScope: string,
): WorkspaceResourceCandidate[] {
  const fromEvidence: WorkspaceResourceCandidate[] = evidence.map((doc) => ({
    id: doc.id,
    kind: "evidence",
    filename: doc.filename,
    mediaType: doc.mediaType,
    size: doc.size,
    url: doc.url,
  }))
  const fromArtifacts: WorkspaceResourceCandidate[] = artifacts.map(
    (artifact) => ({
      id: artifact.id,
      kind: "artifact",
      filename: artifact.filename,
      mediaType: artifact.mediaType,
      size: artifact.size,
      url: artifactUrl(artifact.id, artifactScope),
    }),
  )
  return [...fromEvidence, ...fromArtifacts]
}
