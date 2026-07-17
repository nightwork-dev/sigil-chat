export type ReviewAnnotationKind = "note" | "flag" | "question" | "approval";

export interface ReviewPassage {
  id: string;
  sectionId: string;
  title: string;
  body: string;
  order: number;
}

export interface ReviewDecision {
  id: string;
  passageIds: string[];
  kind: string;
  title: string;
  body: string;
  status: "open" | "locked";
  proposedBy: "agent" | "human";
  createdAt: string;
  resolvedAt?: string;
}

export interface ReviewAnnotation {
  id: string;
  passageIds: string[];
  kind: ReviewAnnotationKind;
  body: string;
  author: string;
  status: "open" | "resolved";
  resolution?: "dismissed" | "converted";
  createdAt: string;
  resolutionNote?: string;
  resolvedAt?: string;
}

export interface ReviewAcceptanceCheck {
  id: string;
  label: string;
  checked: boolean;
}

export interface ReviewAcceptanceReceipt {
  id: string;
  revision: number;
  reviewer: string;
  device?: string;
  notes?: string;
  checklist: ReviewAcceptanceCheck[];
  acceptedAt: string;
}

export interface ReviewRevision {
  id: string;
  revision: number;
  label: string;
  parentId?: string;
  authoredBy: string;
  createdAt: string;
  note?: string;
}

export interface ReviewDocument {
  id: string;
  title: string;
  revision: number;
  outline: Array<{ id: string; title: string; passageIds: string[] }>;
  passages: ReviewPassage[];
  decisions: ReviewDecision[];
  annotations: ReviewAnnotation[];
  acceptance: {
    checklist: ReviewAcceptanceCheck[];
    receipts: ReviewAcceptanceReceipt[];
  };
  history: ReviewRevision[];
}

export interface ReviewPassageEdit {
  id: string;
  body: string;
  expectedBody?: string;
}

export type ReviewUpdateResult =
  | {
      applied: true;
      document: ReviewDocument;
      passages: ReviewPassage[];
    }
  | {
      applied: false;
      conflict: {
        kind: "revision" | "passage";
        id?: string;
        expectedRevision?: number;
        actualRevision: number;
        expectedBody?: string;
        actualBody?: string;
      };
      document: ReviewDocument;
    };

export interface ReviewMutationResult {
  document: ReviewDocument;
}

export interface ReviewAcceptanceInput {
  reviewer: string;
  device?: string;
  notes?: string;
}
