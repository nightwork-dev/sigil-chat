import type {
  GraphValue,
  ReducerGraphCommand,
} from "@workspace/graph/document";
import type {
  ReviewAnnotationKind,
  ReviewPassageEdit,
} from "@workspace/review-store/types";

export interface UpdateNodeInput {
  id: string;
  label?: string;
  inputValues?: Record<string, GraphValue>;
  expectedRevision?: number;
}

export interface AddNodeInput {
  reducerId: string;
  id?: string;
  label?: string;
  position?: { x: number; y: number };
  inputValues?: Record<string, GraphValue>;
  expectedRevision?: number;
}

export interface ConnectInput {
  id?: string;
  sourceNodeId: string;
  sourceSocket: string;
  targetNodeId: string;
  targetSocket: string;
  order?: number;
  expectedRevision?: number;
}

export interface RemoveInput {
  id: string;
  kind: "node" | "edge";
  expectedRevision?: number;
}

export interface RevisionInput {
  expectedRevision?: number;
}

export interface ReducerCatalogInput {
  query?: string;
  reducerId?: string;
}

export interface BatchInput {
  commands: ReducerGraphCommand[];
  expectedRevision?: number;
}

export type GraphEditAction =
  | ({ type: "add-node" } & Omit<AddNodeInput, "expectedRevision">)
  | ({ type: "update-node" } & Omit<UpdateNodeInput, "expectedRevision">)
  | {
      type: "move-node";
      id: string;
      position: { x: number; y: number };
    }
  | { type: "remove-node"; id: string }
  | ({ type: "connect" } & Omit<ConnectInput, "expectedRevision">)
  | { type: "remove-edge"; id: string };

export interface GraphEditInput {
  actions: GraphEditAction[];
  expectedRevision?: number;
}

export interface ReviewPassagesInput {
  ids: string[];
  before?: number;
  after?: number;
}

export interface ReviewItemsInput {
  ids?: string[];
  passageIds?: string[];
  status?: "open" | "resolved" | "locked";
}

export interface AddReviewAnnotationsInput {
  annotations: Array<{
    id?: string;
    passageIds: string[];
    kind: ReviewAnnotationKind;
    body: string;
    author?: string;
  }>;
}

export interface UpdateReviewPassagesInput {
  passages: ReviewPassageEdit[];
  expectedRevision?: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isOptionalString(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || typeof value[key] === "string";
}

export function isOptionalInteger(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || Number.isInteger(value[key]);
}

export function isOptionalRecord(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || isRecord(value[key]);
}

export function isEmptyObject(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isReducerCatalogInput(
  value: unknown,
): value is ReducerCatalogInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ["query", "reducerId"]))
    return false;
  return (
    isOptionalString(value, "query") && isOptionalString(value, "reducerId")
  );
}

export function isBatchInput(value: unknown): value is BatchInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ["commands", "expectedRevision"]))
    return false;
  return (
    Array.isArray(value.commands) &&
    value.commands.length > 0 &&
    isOptionalInteger(value, "expectedRevision")
  );
}

export function isGraphEditInput(value: unknown): value is GraphEditInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ["actions", "expectedRevision"]))
    return false;
  return (
    Array.isArray(value.actions) &&
    value.actions.length > 0 &&
    isOptionalInteger(value, "expectedRevision")
  );
}

export function isUpdateNodeInput(value: unknown): value is UpdateNodeInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "label", "inputValues", "expectedRevision"]) ||
    typeof value.id !== "string"
  )
    return false;
  return (
    isOptionalString(value, "label") &&
    isOptionalRecord(value, "inputValues") &&
    isOptionalInteger(value, "expectedRevision")
  );
}

export function isPosition(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["x", "y"]) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  );
}

export function isAddNodeInput(value: unknown): value is AddNodeInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "reducerId",
      "id",
      "label",
      "position",
      "inputValues",
      "expectedRevision",
    ]) ||
    typeof value.reducerId !== "string"
  )
    return false;
  return (
    isOptionalString(value, "id") &&
    isOptionalString(value, "label") &&
    (value.position === undefined || isPosition(value.position)) &&
    isOptionalRecord(value, "inputValues") &&
    isOptionalInteger(value, "expectedRevision")
  );
}

export function isConnectInput(value: unknown): value is ConnectInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "sourceNodeId",
      "sourceSocket",
      "targetNodeId",
      "targetSocket",
      "order",
      "expectedRevision",
    ]) ||
    typeof value.sourceNodeId !== "string" ||
    typeof value.sourceSocket !== "string" ||
    typeof value.targetNodeId !== "string" ||
    typeof value.targetSocket !== "string"
  )
    return false;
  return (
    isOptionalString(value, "id") &&
    isOptionalInteger(value, "order") &&
    isOptionalInteger(value, "expectedRevision")
  );
}

export function isRemoveInput(value: unknown): value is RemoveInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "kind", "expectedRevision"]) ||
    typeof value.id !== "string" ||
    (value.kind !== "node" && value.kind !== "edge")
  )
    return false;
  return isOptionalInteger(value, "expectedRevision");
}

export function isRevisionInput(value: unknown): value is RevisionInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["expectedRevision"]) &&
    isOptionalInteger(value, "expectedRevision")
  );
}

export function isStringArray(
  value: unknown,
  allowEmpty = false,
): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

export function isOptionalStringArray(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || isStringArray(value[key]);
}

export function isBoundedOptionalCount(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return (
    value[key] === undefined ||
    (Number.isInteger(value[key]) &&
      (value[key] as number) >= 0 &&
      (value[key] as number) <= 10)
  );
}

export function isReviewPassagesInput(
  value: unknown,
): value is ReviewPassagesInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["ids", "before", "after"]) &&
    isStringArray(value.ids) &&
    isBoundedOptionalCount(value, "before") &&
    isBoundedOptionalCount(value, "after")
  );
}

export function isReviewItemsInput(
  value: unknown,
  statuses: readonly string[],
): value is ReviewItemsInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["ids", "passageIds", "status"]) &&
    isOptionalStringArray(value, "ids") &&
    isOptionalStringArray(value, "passageIds") &&
    (value.status === undefined ||
      (typeof value.status === "string" && statuses.includes(value.status)))
  );
}

export function isReviewDecisionItemsInput(
  value: unknown,
): value is ReviewItemsInput {
  return isReviewItemsInput(value, ["open", "locked"]);
}

export function isReviewAnnotationItemsInput(
  value: unknown,
): value is ReviewItemsInput {
  return isReviewItemsInput(value, ["open", "resolved"]);
}

export function isReviewAnnotationKind(
  value: unknown,
): value is ReviewAnnotationKind {
  return (
    value === "note" ||
    value === "flag" ||
    value === "question" ||
    value === "approval"
  );
}

export function isAddReviewAnnotationsInput(
  value: unknown,
): value is AddReviewAnnotationsInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["annotations"]) &&
    Array.isArray(value.annotations) &&
    value.annotations.length > 0 &&
    value.annotations.every(
      (annotation) =>
        isRecord(annotation) &&
        hasOnlyKeys(annotation, [
          "id",
          "passageIds",
          "kind",
          "body",
          "author",
        ]) &&
        isOptionalString(annotation, "id") &&
        isStringArray(annotation.passageIds) &&
        isReviewAnnotationKind(annotation.kind) &&
        typeof annotation.body === "string" &&
        annotation.body.trim().length > 0 &&
        isOptionalString(annotation, "author"),
    )
  );
}

export function isUpdateReviewPassagesInput(
  value: unknown,
): value is UpdateReviewPassagesInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["passages", "expectedRevision"]) &&
    Array.isArray(value.passages) &&
    value.passages.length > 0 &&
    value.passages.every(
      (passage) =>
        isRecord(passage) &&
        hasOnlyKeys(passage, ["id", "body", "expectedBody"]) &&
        typeof passage.id === "string" &&
        passage.id.length > 0 &&
        typeof passage.body === "string" &&
        isOptionalString(passage, "expectedBody"),
    ) &&
    isOptionalInteger(value, "expectedRevision")
  );
}
